"""R0: API contract tests. All domain functions mocked — hermetic, no network."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import api.main as m  # noqa: E402


def _frame(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_healthz():
    with TestClient(m.app) as client:
        assert client.get("/healthz").json() == {"ok": True}


def test_years(monkeypatch):
    monkeypatch.setattr(m.data_loader, "list_years", lambda: [2023, 2024])
    with TestClient(m.app) as client:
        assert client.get("/years").json() == [2023, 2024]


def test_sessions_status_probes(monkeypatch):
    monkeypatch.setattr(
        m.data_loader,
        "session_has_telemetry",
        lambda k: (True, "") if k == 1 else (False, "no telemetry"),
    )
    with TestClient(m.app) as client:
        got = client.get("/sessions/status", params={"keys": "1,2"}).json()
        assert got == {"1": "", "2": "no telemetry"}


def test_lap_window_404(monkeypatch):
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "lap_window", lambda df, lap: (None, None))
    with TestClient(m.app) as client:
        url = "/lap-window"
        params = {"session_key": 1, "driver_number": 1, "lap": 9}
        assert client.get(url, params=params).status_code == 404


def test_car_window_serializes(monkeypatch):
    laps = _frame(
        [{"lap_number": [8, 9][i], "date_start": f"2024-01-01T00:0{i}:00+00:00"} for i in range(2)]
    )
    car = _frame(
        [
            {"date": "2024-01-01T00:00:10+00:00", "speed": 200, "n_gear": 4},
            {"date": "2024-01-01T00:05:10+00:00", "speed": 250, "n_gear": 6},
        ]
    )
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: laps)
    monkeypatch.setattr(m.data_loader, "get_car_data", lambda *a, **k: car)
    with TestClient(m.app) as client:
        rows = client.get("/car", params={"session_key": 1, "driver_number": 1, "lap": 8}).json()
        assert len(rows) == 1 and rows[0]["speed"] == 200 and rows[0]["t"] == 0.0


def test_geometry_shape(monkeypatch):
    import numpy as np

    n = 200
    days = pd.date_range("2024-01-01", periods=n, freq="1s")
    stamp = days.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    loc = _frame(
        {
            "date": stamp,
            "x": np.linspace(0, 1000, n),
            "y": np.sin(np.linspace(0, 6.28, n)) * 100,
            "z": 0.0,
        }
    )
    laps = _frame([{"lap_number": 1, "date_start": "2024-01-01T00:00:00+00:00"}])
    monkeypatch.setattr(m.data_loader, "get_location", lambda *a, **k: loc)
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: laps)
    monkeypatch.setattr(
        m.data_loader,
        "lap_window",
        lambda df, lap: (
            pd.Timestamp("2024-01-01T00:00:00+00:00"),
            pd.Timestamp("2024-01-01T00:03:20+00:00"),
        ),
    )
    monkeypatch.setattr(m.data_loader, "get_car_data", lambda *a, **k: _frame([]))
    with TestClient(m.app) as client:
        params = {"session_key": 1, "driver_number": 1, "lap": 1}
        body = client.get("/geometry", params=params).json()
        assert body["ax"] in ("x", "y") and len(body["outline"]) > 10
        assert isinstance(body["corners"], list) and isinstance(body["zones"], list)


def test_coach_ask_fallback(monkeypatch):
    monkeypatch.setattr(m.coach, "ask_llm", lambda prompt: None)
    payload = {
        "driver": "#1 VER",
        "lap": 8,
        "ref_driver": "#11 PER",
        "ref_lap": 8,
        "corner": "T1",
        "loss_s": 0.234,
        "lap_delta_s": 0.1,
    }
    with TestClient(m.app) as client:
        body = client.post("/coach/ask", json=payload).json()
        assert body["answer"] is None and body["llm"] is False and body["confidence"] == "MED"


def test_records_strict_json() -> None:
    import json

    nan_df = _frame([{"driver_number": 1, "lap_duration": float("nan")}])
    rows = m.records(nan_df)
    assert rows[0]["lap_duration"] is None
    json.dumps(rows, allow_nan=False)
    arr_df = pd.DataFrame({"seg": [None]})
    arr_df.at[0, "seg"] = np.array([1.0, 2.0])
    rows = m.records(arr_df)
    assert rows[0]["seg"] == [1.0, 2.0]
    json.dumps(rows, allow_nan=False)


def test_location_absolute_window(monkeypatch):
    car = _frame(
        [
            {"date": "2024-01-01T00:00:10+00:00", "x": 1.0, "y": 2.0, "z": 0.0},
            {"date": "2024-01-01T00:05:10+00:00", "x": 9.0, "y": 9.0, "z": 0.0},
        ]
    )
    monkeypatch.setattr(m.data_loader, "get_location", lambda *a, **k: car)
    with TestClient(m.app) as client:
        rows = client.get(
            "/location",
            params={
                "session_key": 1,
                "driver_number": 1,
                "start": "2024-01-01T00:00:00+00:00",
                "end": "2024-01-01T00:01:00+00:00",
            },
        ).json()
        assert len(rows) == 1 and rows[0]["x"] == 1.0 and rows[0]["t"] == 0.0


def test_pit_call_delegates_to_model():
    payload = {
        "base_pace_s": 90.0,
        "fresh_pace_s": 89.0,
        "deg_slope_s_per_lap": 0.2,
        "laps_remaining": 30,
        "pit_loss_s": 22.0,
        "gap_behind_s": 60.0,
    }
    with TestClient(m.app) as client:
        body = client.post("/pit-call", json=payload).json()
        assert body["recommendation"] == "PIT NOW" and body["toy_model"] is True
