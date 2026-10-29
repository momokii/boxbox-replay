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


# --- M1: picker helpers ---

SESSIONS_2024 = [
    {
        "session_key": 1,
        "meeting_key": 10,
        "meeting_name": "Bahrain Grand Prix",
        "location": "Sakhir",
        "session_name": "Race",
        "date_start": "2024-03-02T15:00:00+00:00",
    },
    {
        "session_key": 2,
        "meeting_key": 10,
        "meeting_name": "Bahrain Grand Prix",
        "location": "Sakhir",
        "session_name": "Qualifying",
        "date_start": "2024-03-01T15:00:00+00:00",
    },
    {
        "session_key": 3,
        "meeting_key": 11,
        "meeting_name": "Japanese Grand Prix",
        "location": "Suzuka",
        "session_name": "Race",
        "date_start": "2024-04-07T05:00:00+00:00",
    },
]


def _mock_sessions(monkeypatch, isolated_cache):
    monkeypatch.setattr(data_loader, "_fetch", lambda endpoint, params=None: SESSIONS_2024)


def test_list_meetings_groups_and_orders(isolated_cache, monkeypatch):
    _mock_sessions(monkeypatch, isolated_cache)
    meetings = data_loader.list_meetings(2024)
    assert meetings["meeting_name"].tolist() == ["Bahrain Grand Prix", "Japanese Grand Prix"]
    assert meetings.set_index("meeting_name").loc["Bahrain Grand Prix", "sessions"] == 2


def test_sessions_for_meeting_filters(isolated_cache, monkeypatch):
    _mock_sessions(monkeypatch, isolated_cache)
    df = data_loader.sessions_for_meeting(2024, 10)
    assert sorted(df["session_key"].tolist()) == [1, 2]


def test_session_has_telemetry_true_false_and_no_drivers(isolated_cache, monkeypatch):
    def fake_fetch(endpoint, params=None):
        if endpoint == "drivers":
            return [{"driver_number": 1}] if params["session_key"] != 99 else []
        if endpoint == "car_data":
            return [{"speed": 300}] if params["session_key"] == 1 else []
        raise AssertionError(endpoint)

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)
    assert data_loader.session_has_telemetry(1) == (True, "")
    assert data_loader.session_has_telemetry(2) == (False, "no telemetry")
    assert data_loader.session_has_telemetry(99) == (False, "no drivers")


def test_format_lap_time_three_decimals():
    assert data_loader.format_lap_time(88.197) == "1:28.197"
    assert data_loader.format_lap_time(60.0) == "1:00.000"
    assert data_loader.format_lap_time(None) == "—"
    assert data_loader.format_lap_time(float("nan")) == "—"


def test_clamp_selection_keeps_order_max_three():
    assert data_loader.clamp_selection(["a", "b", "c", "d"]) == ["a", "b", "c"]
    assert data_loader.clamp_selection(["a"]) == ["a"]
