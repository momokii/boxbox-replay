"""Grounded race answers through the OpenCode Go OpenAI-compatible endpoint.

The key never leaves the server: the browser only ever sees answers. Prompts are
built from measured session data (see `api.main._ai_facts`), and the model is
told to refuse anything the data cannot support.

Provider notes, from https://opencode.ai/docs/go/ (2026-11-03):
- model id `deepseek-v4.1-flash`, endpoint `/inference/go/openai/v1/chat/completions`
- a stable `x-opencode-session` header is required, and clients should identify
  themselves with their own user agent.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time

import httpx

BASE_URL = os.getenv("OPENCODE_BASE_URL", "https://opencode.ai/inference/go/openai/v1").rstrip("/")
API_KEY = os.getenv("OPENCODE_API_KEY", "").strip()
MODEL = os.getenv("OPENCODE_MODEL", "deepseek-v4.1-flash").strip()
MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "1200"))
RATE_PER_MIN = int(os.getenv("AI_RATE_PER_MIN", "6"))
TIMEOUT_S = float(os.getenv("AI_TIMEOUT_S", "60"))
USER_AGENT = "boxbox-replay/2.2"

SYSTEM = (
    "You are the race engineer inside BoxBox Replay, a free F1 replay app. You are "
    "talking to a curious fan who knows the basics but not the jargon. Be warm, "
    "plain and specific; no hype and no bullet lists.\n"
    "NAMES: use the driver's full name the first time (for example \"Kimi Antonelli\"), "
    "then the surname; put the three-letter code in brackets only when it helps.\n"
    "VOICE: never say \"the data\", \"the dataset\", \"the feed\", \"the API\", "
    "\"the session DATA\" or \"official race report\". You are the app, not a database "
    "reading out fields. Say what you can and cannot see in your own words.\n"
    "SCOPE: answer only about this session and Formula 1. If the question is about "
    "anything else (politics, coding, personal advice, other sports, news), reply with "
    "exactly: OUT_OF_SCOPE\n"
    "SESSION TYPE: the notes say whether this is a race, qualifying or practice. In "
    "qualifying or practice there is no winner, podium or retirement: talk about the "
    "fastest laps, the order and the gaps instead. Never carry race language into a "
    "non-race session.\n"
    "HONESTY: use only the SESSION NOTES. Never invent times, penalties, incidents or "
    "quotes. If you subtract two listed lap times, say it is a best-lap gap rather "
    "than official timing. If the notes cannot answer, say in one sentence what is "
    "missing and offer a related question you can answer.\n"
    "LENGTH: at most four short sentences, unless the user asks for a recap."
)

# Branded refusal used when the model returns the sentinel.
OUT_OF_SCOPE = (
    "That one is outside this race. I can help with what happened on track - strategy, "
    "pace, overtakes, retirements, or a recap of this session."
)

class AINotConfigured(RuntimeError):
    """No API key: the feature is off, and says so."""


class AIError(RuntimeError):
    """Upstream failure; the caller surfaces a retryable message."""


def configured() -> bool:
    return bool(API_KEY)


def status() -> dict:
    return {"configured": configured(), "model": MODEL}


# One shared budget: a portfolio deployment must not burn the subscription.
_last_call = 0.0
_call_stamps: list[float] = []
_budget_lock = threading.Lock()

# Answers are deterministic enough to cache per session + question.
_cache: dict[str, str] = {}
_cache_lock = threading.Lock()
CACHE_MAX = 64


def _budget() -> None:
    """At most RATE_PER_MIN requests per rolling minute, one per second."""
    global _last_call
    with _budget_lock:
        while True:
            now = time.monotonic()
            while _call_stamps and now - _call_stamps[0] >= 60:
                _call_stamps.pop(0)
            wait = 0.0
            if _last_call and now - _last_call < 1.0:
                wait = 1.0 - (now - _last_call)
            if len(_call_stamps) >= RATE_PER_MIN:
                wait = max(wait, 60 - (now - _call_stamps[0]))
            if wait <= 0:
                _last_call = now
                _call_stamps.append(now)
                return
            time.sleep(wait)


def _key(kind: str, session_key: int, extra: str) -> str:
    digest = hashlib.sha1(extra.strip().lower().encode("utf-8")).hexdigest()[:12]
    return f"{kind}:{session_key}:{digest}"


def _request(session_key: int, messages: list[dict]) -> str:
    """POST one OpenAI-compatible conversation and return the text."""
    if not configured():
        raise AINotConfigured("AI is not configured")
    _budget()
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        # Stable per session so the provider can route and cache predictably.
        "x-opencode-session": f"boxbox-{session_key}",
    }
    body = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "temperature": 0.2,
    }
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with httpx.Client(timeout=TIMEOUT_S) as client:
                response = client.post(f"{BASE_URL}/chat/completions", headers=headers, json=body)
            if response.status_code in (401, 403):
                raise AINotConfigured("the provider rejected the key")
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = AIError(f"provider HTTP {response.status_code}")
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
                continue
            response.raise_for_status()
            payload = response.json()
            choice = payload["choices"][0]
            text = (choice["message"].get("content") or "").strip()
            if not text:
                raise AIError("empty answer")
            if choice.get("finish_reason") == "length":
                # Never show half a sentence: the caller retries with a longer cap.
                last_error = AIError("answer hit the token cap")
                body["max_tokens"] = min(MAX_TOKENS * 2, 4000)
                continue
            return text
        except httpx.HTTPError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise AIError(f"AI request failed: {last_error}")


def _complete(session_key: int, prompt: str) -> str:
    return _request(
        session_key,
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
    )


def chat(session_key: int, facts: str, history: list[dict]) -> str:
    """Answer the last turn with bounded conversation context.

    `history` is a list of {"role": "user"|"assistant", "content": str}; the
    caller has already trimmed it. The session notes ride in the system message
    so every turn is grounded in the same measured facts.
    """
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM + "\n\nSESSION NOTES:\n" + facts}
    ]
    for turn in history:
        role = turn.get("role")
        content = str(turn.get("content", "")).strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content[:1600]})
    text = _request(session_key, messages)
    if text.strip().upper().startswith("OUT_OF_SCOPE"):
        return OUT_OF_SCOPE
    return text


def answer_corner(session_key: int, facts: str, prompt: str) -> str:
    """Answer the corner coach's grounded prompt; empty when it goes off-scope."""
    text = _request(
        session_key,
        [
            {"role": "system", "content": SYSTEM + "\n\nSESSION NOTES:\n" + facts},
            {"role": "user", "content": prompt},
        ],
    )
    if text.strip().upper().startswith("OUT_OF_SCOPE"):
        return ""
    return text


def explain_pit(session_key: int, notes: str) -> str:
    """Explain an already-computed pit call. The model never does the maths."""
    prompt = (
        f"PIT MODEL OUTPUT:\n{notes}\n\n"
        "TASK: explain this pit call to a fan in three short sentences, in the app's "
        "voice. Use only the numbers above; do not calculate new ones. Say which way "
        "the model leans and why, and name the single biggest assumption behind it. "
        "If the call is close, say it is close instead of inventing certainty."
    )
    text = _complete(session_key, prompt)
    if text.strip().upper().startswith("OUT_OF_SCOPE"):
        return OUT_OF_SCOPE
    return text


def answer(session_key: int, facts: str, question: str) -> str:
    """Answer `question` from `facts`, cached per session and question."""
    key = _key("ask", session_key, question)
    with _cache_lock:
        hit = _cache.get(key)
    if hit:
        return hit
    prompt = f"SESSION NOTES:\n{facts}\n\nQUESTION: {question.strip()}"
    text = _complete(session_key, prompt)
    if text.strip().upper().startswith("OUT_OF_SCOPE"):
        text = OUT_OF_SCOPE
    _remember(key, text)
    return text


def recap(session_key: int, facts: str) -> str:
    """A short race recap from the same facts, cached per session."""
    key = _key("recap", session_key, "recap")
    with _cache_lock:
        hit = _cache.get(key)
    if hit:
        return hit
    prompt = (
        "SESSION NOTES:\n"
        f"{facts}\n\n"
        "TASK: write a five or six sentence story of this session for someone who "
        "missed it. Use the session type in the notes: for a race, cover the win, the "
        "podium, the decisive strategy, the biggest mover and any retirements; for "
        "qualifying, cover pole and the gap, the fight through the sessions and the "
        "order; for practice, cover the fastest lap, the teams that looked strong and "
        "the order. Use full names on first mention, tell it as a story, and never "
        "invent a race result for a non-race session. If the notes are thin on a point, "
        "say so in one short clause."
    )
    text = _complete(session_key, prompt)
    if text.strip().upper().startswith("OUT_OF_SCOPE"):
        text = OUT_OF_SCOPE
    _remember(key, text)
    return text


def _remember(key: str, text: str) -> None:
    with _cache_lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[key] = text
