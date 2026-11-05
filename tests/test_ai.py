"""AI module tests: no network. The provider client is faked."""

import json

import pytest

import ai


class FakeResponse:
    def __init__(self, status_code=200, content="ok"):
        self.status_code = status_code
        self._body = {"choices": [{"message": {"content": content}}]}

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._body


def test_not_configured_raises(monkeypatch):
    monkeypatch.setattr(ai, "API_KEY", "")
    with pytest.raises(ai.AINotConfigured):
        ai._complete(1, "prompt")


def test_request_sends_session_header_and_never_the_prompt_key(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, headers=None, json=None):
            seen["url"] = url
            seen["headers"] = headers
            seen["json"] = json
            return FakeResponse(200, "answer")

    monkeypatch.setattr(ai, "API_KEY", "secret-key")
    monkeypatch.setattr(ai.httpx, "Client", FakeClient)
    monkeypatch.setattr(ai, "_budget", lambda: None)

    assert ai._complete(42, "DATA: x") == "answer"
    assert seen["url"].endswith("/chat/completions")
    assert seen["headers"]["Authorization"] == "Bearer secret-key"
    assert seen["headers"]["x-opencode-session"] == "boxbox-42"
    assert seen["headers"]["User-Agent"].startswith("boxbox-replay/")
    assert seen["json"]["model"] == ai.MODEL
    assert "secret-key" not in json.dumps(seen["json"])


def test_401_is_not_retried(monkeypatch):
    calls = {"n": 0}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            calls["n"] += 1
            return FakeResponse(401)

    monkeypatch.setattr(ai, "API_KEY", "k")
    monkeypatch.setattr(ai.httpx, "Client", FakeClient)
    monkeypatch.setattr(ai, "_budget", lambda: None)
    with pytest.raises(ai.AINotConfigured):
        ai._complete(1, "prompt")
    assert calls["n"] == 1


def test_answer_caches_per_question(monkeypatch):
    calls = {"n": 0}

    def fake_complete(session_key, prompt):
        calls["n"] += 1
        return "cached answer"

    monkeypatch.setattr(ai, "_complete", fake_complete)
    ai._cache.clear()
    assert ai.answer(7, "facts", "Who won?") == "cached answer"
    assert ai.answer(7, "facts", "who won?  ") == "cached answer"
    assert calls["n"] == 1
    assert ai.answer(8, "facts", "Who won?") == "cached answer"
    assert calls["n"] == 2
