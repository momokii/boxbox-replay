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
    "HONESTY: use only the SESSION NOTES. Never invent times, penalties, incidents or "
    "quotes. If the notes cannot answer, say in one sentence what is missing and offer "
    "a related question you can answer.\n"
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


def _complete(session_key: int, prompt: str) -> str:
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
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
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
        "TASK: write a five or six sentence race story for someone who missed it. "
        "Who won and how the podium shaped up; the decisive strategy or stop; the "
        "biggest mover or best overtake; retirements or incidents if any; the fastest "
        "lap. Use full names on first mention and tell it as a story, not a list. If "
        "the notes are thin on a point, say so in one short clause instead of guessing. "
        "If this is not a race session, recap what the session actually was."
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
