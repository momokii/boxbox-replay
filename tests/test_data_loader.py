"""M0 tests: cache behavior, empty-telemetry handling, retry. All HTTP mocked."""

import pandas as pd
import pytest

import data_loader


@pytest.fixture
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(data_loader, "CACHE_ROOT", tmp_path / "cache")
    monkeypatch.setattr(data_loader, "RATE_MIN_INTERVAL_S", 0.0)
    return tmp_path / "cache"


def test_cache_miss_fetches_then_hit_avoids_network(isolated_cache, monkeypatch):
    calls = {"n": 0}

    def fake_fetch(endpoint, params=None):
        calls["n"] += 1
        return [{"session_key": 9492, "meeting_name": "Japanese Grand Prix"}]

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)
    first = data_loader.list_sessions(2024)
    second = data_loader.list_sessions(2024)
    assert calls["n"] == 1  # second call served from parquet
    assert len(first) == 1 and len(second) == 1
    assert list(isolated_cache.rglob("*.parquet"))  # cache file written


def test_empty_response_returns_empty_frame_no_crash(isolated_cache, monkeypatch):
    """Empty car_data must surface as empty (M1 hides it), never raise, never fake."""
    monkeypatch.setattr(data_loader, "_fetch", lambda endpoint, params=None: [])
    df = data_loader.get_car_data(session_key=12345)
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setattr(data_loader, "RATE_MIN_INTERVAL_S", 0.0)
    attempts = {"n": 0}

    class FakeResp:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError("should not raise on 429 path")

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            attempts["n"] += 1
            if attempts["n"] == 1:
                return FakeResp(429, [])
            return FakeResp(200, [{"ok": True}])

    monkeypatch.setattr(data_loader.httpx, "Client", FakeClient)
    monkeypatch.setattr(data_loader.time, "sleep", lambda s: None)
    assert data_loader._fetch("sessions", {"year": 2024}) == [{"ok": True}]
    assert attempts["n"] == 2
