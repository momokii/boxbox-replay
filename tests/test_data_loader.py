"""M0 tests: cache behavior, empty-telemetry handling, retry. All HTTP mocked."""

import pandas as pd
import pytest

import data_loader


@pytest.fixture
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(data_loader, "CACHE_ROOT", tmp_path / "cache")
    monkeypatch.setattr(data_loader, "_throttle", lambda: None)
    return tmp_path / "cache"


def test_cache_miss_fetches_then_hit_avoids_network(isolated_cache, monkeypatch):
    calls = {"n": 0}

    def fake_fetch(endpoint, params=None):
        calls["n"] += 1
        if endpoint == "meetings":
            return [{"meeting_key": 11, "meeting_name": "Japanese Grand Prix"}]
        return [{"session_key": 9492, "meeting_key": 11}]

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)
    first = data_loader.list_sessions(2024)
    assert len(first) == 1
    second = data_loader.list_sessions(2024)
    assert len(second) == 1
    assert calls["n"] == 2
    assert list(isolated_cache.rglob("*.parquet"))  # cache files written


def test_fetch_404_means_empty_no_retry(monkeypatch):
    monkeypatch.setattr(data_loader, "_throttle", lambda: None)
    monkeypatch.setattr(data_loader.time, "sleep", lambda s: None)
    calls = {"n": 0}

    class FakeResp:
        status_code = 404

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            calls["n"] += 1
            return FakeResp()

    monkeypatch.setattr(data_loader.httpx, "Client", FakeClient)
    assert data_loader._fetch("intervals", {"session_key": 1}) == []
    assert calls["n"] == 1  # 404 is final: no retry


def test_empty_response_returns_empty_frame_no_crash(isolated_cache, monkeypatch):
    """Empty car_data must surface as empty (M1 hides it), never raise, never fake."""
    monkeypatch.setattr(data_loader, "_fetch", lambda endpoint, params=None: [])
    df = data_loader.get_car_data(session_key=12345)
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setattr(data_loader, "_throttle", lambda: None)
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
    def fake_fetch(endpoint, params=None):
        if endpoint == "meetings":
            return [
                {"meeting_key": 10, "meeting_name": "Bahrain Grand Prix"},
                {"meeting_key": 11, "meeting_name": "Japanese Grand Prix"},
            ]
        return SESSIONS_2024

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)


def test_list_sessions_joins_meeting_names(isolated_cache, monkeypatch):
    _mock_sessions(monkeypatch, isolated_cache)
    df = data_loader.list_sessions(2024)
    assert set(df["meeting_name"].unique()) == {"Bahrain Grand Prix", "Japanese Grand Prix"}
    again = data_loader.list_sessions(2024)  # cache hit keeps the join
    assert set(again["meeting_name"].unique()) == set(df["meeting_name"].unique())
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
def test_lap_window_start_and_next():
    import pandas as pd

    df = pd.DataFrame(
        {
            "lap_number": [8, 9],
            "date_start": ["2024-04-06T06:00:00+00:00", "2024-04-06T06:01:30+00:00"],
        }
    )
    start, end = data_loader.lap_window(df, 8)
    assert start == pd.Timestamp("2024-04-06T06:00:00+00:00")
    assert end == pd.Timestamp("2024-04-06T06:01:30+00:00")
    assert data_loader.lap_window(df, 99) == (None, None)


# --- M2: battle data ---
def _laps_df():
    import pandas as pd

    return pd.DataFrame(
        {
            "driver_number": [1, 1, 1],
            "lap_number": [8, 9, 10],
            "date_start": [
                "2024-04-06T06:00:00+00:00",
                "2024-04-06T06:01:30+00:00",
                "2024-04-06T06:03:00+00:00",
            ],
        }
    )


def test_lap_car_data_windows_by_lap(monkeypatch, isolated_cache):
    import pandas as pd

    car = pd.DataFrame(
        {"date": ["2024-04-06T06:00:10+00:00", "2024-04-06T06:01:40+00:00"], "speed": [200, 250]}
    )

    def fake_fetch(endpoint, params=None):
        return _laps_df().to_dict("records") if endpoint == "laps" else car.to_dict("records")

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)
    lap8 = data_loader.lap_car_data(1, 1, 8)
    assert lap8["speed"].tolist() == [200]  # only rows before lap 9 starts
    assert data_loader.lap_car_data(1, 1, 99).empty  # unknown lap -> empty, no crash
def test_get_intervals_coerces_lap_strings(monkeypatch, isolated_cache):
    monkeypatch.setattr(
        data_loader,
        "_fetch",
        lambda endpoint, params=None: [
            {"driver_number": 1, "gap_to_leader": "+1 LAP"},
            {"driver_number": 2, "gap_to_leader": 3.5},
        ],
    )
    df = data_loader.get_intervals(8)
    assert pd.isna(df["gap_to_leader"].iloc[0])
    assert df["gap_to_leader"].iloc[1] == 3.5
def test_m5_feeds_cached(monkeypatch, isolated_cache):
    seen: list[str] = []

    def fake_fetch(endpoint, params=None):
        seen.append(endpoint)
        return [{"session_key": 5}]

    monkeypatch.setattr(data_loader, "_fetch", fake_fetch)
    assert len(data_loader.get_stints(5)) == 1
    assert len(data_loader.get_stints(5)) == 1
    assert len(data_loader.get_weather(5)) == 1
    assert len(data_loader.get_team_radio(5)) == 1
    assert len(data_loader.get_race_control(5)) == 1
    assert sorted(set(seen)) == ["race_control", "stints", "team_radio", "weather"]


def test_concurrent_reads_share_one_fetch(tmp_path, monkeypatch):
    """Four threads asking for the same uncached key must hit the API once."""
    import threading
    import time as _time

    calls = {"n": 0}

    def slow_fetch(endpoint, params=None):
        calls["n"] += 1
        _time.sleep(0.1)
        return [{"value": 1}]

    monkeypatch.setattr(data_loader, "_fetch", slow_fetch)
    path = tmp_path / "shared.parquet"
    results: list[pd.DataFrame] = []
    threads = [
        threading.Thread(target=lambda: results.append(data_loader._cached("x", {}, path)))
        for _ in range(4)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert calls["n"] == 1
    assert len(results) == 4
    assert all(len(frame) == 1 for frame in results)
    assert path.exists()


def test_lap_window_handles_a_driver_with_no_laps():
    # An unknown driver returns a frame with no columns; this must be a clean
    # "no window", not a KeyError that surfaces as a 500.
    assert data_loader.lap_window(pd.DataFrame(), 1) == (None, None)
