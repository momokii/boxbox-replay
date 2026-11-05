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
    "You are a concise Formula 1 race engineer explaining a session to a fan who "
    "did not watch it. Use ONLY the DATA below. If the data does not contain the "
    "answer, say plainly that you don't have that information. Never invent times, "
    "positions, penalties or events. Reply in at most four short sentences, plain "
    "text, using the three-letter driver codes."
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
    prompt = f"DATA:\n{facts}\n\nQUESTION: {question.strip()}"
    text = _complete(session_key, prompt)
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
        "DATA:\n"
        f"{facts}\n\n"
        "TASK: write a five-sentence recap of the race: the win, the podium, the "
        "decisive strategy or move, and one honest caveat if the data is thin."
    )
    text = _complete(session_key, prompt)
    _remember(key, text)
    return text


def _remember(key: str, text: str) -> None:
    with _cache_lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[key] = text
