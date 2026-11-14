"""R0: API contract tests. All domain functions mocked — hermetic, no network."""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import api.main as m  # noqa: E402


def _frame(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_healthz():
    with TestClient(m.app) as client:
        assert client.get("/healthz").json() == {"ok": True}
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


def test_coach_ask_uses_a_measured_fallback_without_ai(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: False)
    with TestClient(m.app) as client:
        body = client.post(
            "/coach/ask",
            json={
                "driver": "VER",
                "lap": 11,
                "ref_driver": "PER",
                "ref_lap": 11,
                "corner": "T1",
                "loss_s": 0.234,
                "lap_delta_s": None,
                "session_key": 1,
            },
        ).json()
    assert body["llm"] is False
    assert "0.234s" in body["answer"]
    assert body["confidence"] == "MED"


def test_coach_ask_uses_the_ai_when_configured(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(m, "_ai_facts", lambda sk: ("facts", ["session"]))
    monkeypatch.setattr(m.ai, "answer_corner", lambda sk, facts, prompt: "Brake later.")
    with TestClient(m.app) as client:
        body = client.post(
            "/coach/ask",
            json={
                "driver": "VER",
                "lap": 11,
                "ref_driver": "PER",
                "ref_lap": 11,
                "corner": "T1",
                "loss_s": 0.234,
                "lap_delta_s": None,
                "session_key": 1,
            },
        ).json()
    assert body["llm"] is True
    assert body["answer"] == "Brake later."

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


def test_duel_shape_and_delta_at_the_line(monkeypatch):
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")

    def circle(duration: float, driver: int) -> pd.DataFrame:
        t = np.linspace(0, duration, 400)
        return pd.DataFrame(
            {
                "date": [(start + pd.Timedelta(seconds=float(v))).isoformat() for v in t],
                "x": np.cos(2 * np.pi * t / duration) * 1000,
                "y": np.sin(2 * np.pi * t / duration) * 1000,
                "driver_number": driver,
            }
        )

    locs = {1: circle(90, 1), 2: circle(91, 2)}
    rows = [
        {"driver_number": 1, "lap_number": 10, "lap_duration": 90.0},
        {"driver_number": 2, "lap_number": 10, "lap_duration": 91.0},
    ]

    def fake_laps(session_key, driver_number=None):
        picked = [r for r in rows if driver_number in (None, r["driver_number"])]
        return _frame(picked)

    monkeypatch.setattr(m.data_loader, "list_laps", fake_laps)
    monkeypatch.setattr(
        m.data_loader,
        "lap_window",
        lambda df, lap: (
            start,
            start + pd.Timedelta(seconds=float(df["lap_duration"].iloc[0])),
        ),
    )
    monkeypatch.setattr(m.data_loader, "get_location", lambda sk, drv: locs[drv])

    with TestClient(m.app) as client:
        params = {
            "session_key": 1,
            "a_driver": 1,
            "a_lap": 10,
            "b_driver": 2,
            "b_lap": 10,
        }
        body = client.get("/session/duel", params=params).json()

    assert body["points"] == 600
    assert len(body["traces"]["a"]) == len(body["traces"]["b"]) == 600
    assert body["a"]["lap_duration"] == 90.0
    assert body["delta"][0][1] == pytest.approx(0.0, abs=0.01)
    # Same distance, one second slower: the delta at the line is that second.
    assert body["delta"][-1][1] == pytest.approx(1.0, abs=0.05)


def test_duel_404_when_a_lap_has_no_positions(monkeypatch):
    monkeypatch.setattr(
        m.data_loader,
        "list_laps",
        lambda *a, **k: _frame([{"driver_number": 1, "lap_number": 4, "lap_duration": 90.0}]),
    )
    monkeypatch.setattr(
        m.data_loader,
        "lap_window",
        lambda df, lap: (pd.Timestamp("2024-01-01T00:00:00+00:00"), None),
    )
    monkeypatch.setattr(m.data_loader, "get_location", lambda *a, **k: _frame([]))
    with TestClient(m.app) as client:
        params = {"session_key": 1, "a_driver": 1, "a_lap": 4, "b_driver": 1, "b_lap": 4}
        assert client.get("/session/duel", params=params).status_code == 404
def test_inputs_window_mode_shares_one_axis(monkeypatch):
    clock = pd.Timestamp("2024-01-01T00:00:00+00:00")
    start = clock + pd.Timedelta(seconds=10)  # lights out 10 s into the file
    car = _frame(
        {
            "date": [(start + pd.Timedelta(seconds=s)).isoformat() for s in (0.0, 1.0, 2.0)],
            "throttle": [100, 50, 0],
            "brake": [0, 0, 100],
            "n_gear": [7, 5, 3],
            "drs": [None, None, None],
        }
    )
    monkeypatch.setattr(
        m,
        "_session_clock",
        lambda sk: (
            clock,
            clock + pd.Timedelta(hours=2),
            _frame([{"lap_number": 1, "t": 10.0}]),
            7200.0,
        ),
    )
    monkeypatch.setattr(m.data_loader, "get_car_data", lambda *a, **k: car)

    with TestClient(m.app) as client:
        body = client.get(
            "/session/inputs",
            params={"session_key": 1, "driver_number": 1, "t0": 0, "t1": 3},
        ).json()

    assert body["lap"] is None
    assert body["window_t0"] == 0.0
    assert body["t"] == [0.0, 1.0, 2.0]
    assert body["throttle"] == [100.0, 50.0, 0.0]

    # A driver with no car data in the window is a clean 404.
    monkeypatch.setattr(m.data_loader, "get_car_data", lambda *a, **k: _frame([]))
    with TestClient(m.app) as client:
        res = client.get(
            "/session/inputs",
            params={"session_key": 1, "driver_number": 1, "t0": 0, "t1": 3},
        )
        assert res.status_code == 404
def test_ai_status_and_recap(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(
        m.ai, "status", lambda: {"configured": True, "model": "deepseek-v4.1-flash"}
    )
    monkeypatch.setattr(m, "_ai_facts", lambda sk: ("facts", ["session"]))
    monkeypatch.setattr(m.ai, "recap", lambda sk, facts: "A fine race.")
    with TestClient(m.app) as client:
        status = client.get("/ai/status").json()
        body = client.post("/ai/recap", json={"session_key": 1}).json()
    assert status["ready"] is True and status["model"] == "deepseek-v4.1-flash"
    assert body["answer"] == "A fine race."


def test_ai_facts_include_names_retirements_and_ideal_lap(monkeypatch):

    drivers = _frame(
        [
            {
                "driver_number": 1,
                "name_acronym": "ANT",
                "full_name": "Kimi ANTONELLI",
                "team_name": "Mercedes",
            },
            {
                "driver_number": 2,
                "name_acronym": "LEC",
                "full_name": "Charles LECLERC",
                "team_name": "Ferrari",
            },
            {
                "driver_number": 3,
                "name_acronym": "BOT",
                "full_name": "Valtteri BOTTAS",
                "team_name": "Cadillac",
            },
        ]
    )
    result = _frame(
        [
            {
                "position": 1.0,
                "driver_number": 1,
                "gap_to_leader": 0.0,
                "points": 25.0,
                "number_of_laps": 50,
                "dnf": np.bool_(False),
            },
            {
                "position": 2.0,
                "driver_number": 2,
                "gap_to_leader": 2.5,
                "points": 18.0,
                "number_of_laps": 50,
                "dnf": np.bool_(False),
            },
            {
                "position": np.nan,
                "driver_number": 3,
                "gap_to_leader": np.nan,
                "points": 0.0,
                "number_of_laps": 20,
                "dnf": np.bool_(True),
            },
        ]
    )
    laps = _frame(
        [
            {
                "driver_number": 1,
                "lap_number": 10,
                "lap_duration": 90.0,
                "duration_sector_1": 30.0,
                "duration_sector_2": 31.0,
                "duration_sector_3": 29.0,
            },
            {
                "driver_number": 2,
                "lap_number": 10,
                "lap_duration": 91.0,
                "duration_sector_1": 29.5,
                "duration_sector_2": 31.5,
                "duration_sector_3": 30.0,
            },
        ]
    )
    monkeypatch.setattr(m.data_loader, "list_drivers", lambda *a, **k: drivers)
    monkeypatch.setattr(m.data_loader, "get_session_result", lambda *a, **k: result)
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: laps)
    monkeypatch.setattr(m.data_loader, "get_pit", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_stints", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_overtakes", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_weather", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_race_control", lambda *a, **k: _frame([]))
    monkeypatch.setattr(
        m, "session_info", lambda sk: {"session_name": "Race", "total_laps": 50, "drivers": 3}
    )

    facts, used = m._ai_facts(1)

    # The numpy bool used to defeat `is True`, hiding real retirements.
    assert "Valtteri BOTTAS" in facts and "DNF" in facts
    assert "Kimi ANTONELLI" in facts
    assert "Theoretical best lap" in facts
    assert "classification" in used and "retirements" in used


def test_chat_requires_a_user_turn(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    with TestClient(m.app) as client:
        res = client.post(
            "/ai/chat",
            json={
                "session_key": 1,
                "messages": [{"role": "assistant", "content": "hello"}],
            },
        )
    assert res.status_code == 422


def test_chat_passes_history_and_facts(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(m, "_ai_facts", lambda sk: ("P1 Kimi ANTONELLI", ["classification"]))
    seen = {}

    def fake_chat(session_key, facts, history):
        seen["facts"] = facts
        seen["history"] = history
        return "He pitted on lap 24."

    monkeypatch.setattr(m.ai, "chat", fake_chat)
    with TestClient(m.app) as client:
        body = client.post(
            "/ai/chat",
            json={
                "session_key": 1,
                "messages": [
                    {"role": "user", "content": "Who won?"},
                    {"role": "assistant", "content": "Kimi Antonelli."},
                    {"role": "user", "content": "When did he pit?"},
                ],
            },
        ).json()

    assert body["answer"] == "He pitted on lap 24."
    assert body["grounded_on"] == ["classification"]
    assert seen["facts"] == "P1 Kimi ANTONELLI"
    assert [turn["role"] for turn in seen["history"]] == ["user", "assistant", "user"]


def test_pit_explain_returns_the_model_call(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(m.ai, "explain_pit", lambda sk, notes: "Stay out is safer.")
    with TestClient(m.app) as client:
        body = client.post(
            "/ai/pit",
            json={
                "session_key": 1,
                "driver": "VER",
                "compound": "HARD",
                "tyre_age": 6,
                "base_pace_s": 101.2,
                "fresh_pace_s": 99.8,
                "deg_slope_s_per_lap": 0.08,
                "laps_remaining": 13,
                "pit_loss_s": 22.0,
                "gap_behind_s": 1.2,
            },
        ).json()

    assert body["answer"] == "Stay out is safer."
    assert body["call"]["toy_model"] is True
    assert "stay_total_s" in body["call"] and "pit_total_s" in body["call"]


def test_session_replay_zeroes_time_and_counts_drivers(monkeypatch):
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    frame = _frame(
        {
            "driver_number": [1, 1],
            "t": [10.0, 12.5],  # session time; lights out is at 10 s
            "x": [0.0, 50.0],
            "y": [0.0, 10.0],
        }
    )
    markers = _frame([{"lap_number": 1, "index": 1, "t": 10.0}])
    monkeypatch.setattr(
        m,
        "_session_clock",
        lambda sk: (start, start + pd.Timedelta(hours=2), markers, 5400.0),
    )
    monkeypatch.setattr(m.data_loader, "build_session_replay", lambda *a, **k: frame)
    monkeypatch.setattr(
        m.data_loader, "list_drivers", lambda *a, **k: _frame([{"driver_number": 1}])
    )

    body = m.session_replay(1)

    assert body["drivers"][0]["t"] == [0.0, 2.5]  # zeroed at lights out
    assert body["drivers_included"] == 1 and body["drivers_expected"] == 1
    assert body["duration_s"] == 5400.0  # the race clock, not position coverage
    assert body["laps"][0]["lap_number"] == 1


def test_ai_facts_non_race_has_no_race_language(monkeypatch):
    drivers = _frame(
        [
            {
                "driver_number": 1,
                "name_acronym": "ANT",
                "full_name": "Kimi ANTONELLI",
                "team_name": "Mercedes",
            }
        ]
    )
    result = _frame(
        [
            {
                "position": 1.0,
                "driver_number": 1,
                "gap_to_leader": 0.0,
                "points": 0.0,
                "number_of_laps": 18,
            }
        ]
    )
    laps = _frame(
        [
            {
                "driver_number": 1,
                "lap_number": 10,
                "lap_duration": 90.0,
                "duration_sector_1": 30.0,
                "duration_sector_2": 31.0,
                "duration_sector_3": 29.0,
            }
        ]
    )
    monkeypatch.setattr(m.data_loader, "list_drivers", lambda *a, **k: drivers)
    monkeypatch.setattr(m.data_loader, "get_session_result", lambda *a, **k: result)
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: laps)
    monkeypatch.setattr(m.data_loader, "get_pit", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_stints", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_overtakes", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_weather", lambda *a, **k: _frame([]))
    monkeypatch.setattr(m.data_loader, "get_race_control", lambda *a, **k: _frame([]))
    monkeypatch.setattr(
        m,
        "session_info",
        lambda sk: {"session_name": "Qualifying", "total_laps": 18, "drivers": 1},
    )

    facts, used = m._ai_facts(1)

    assert facts.startswith("Session: Qualifying")
    assert "Qualifying classification" in facts
    assert " winner" not in facts
    assert "Retirements" not in facts
    assert "overtakes" not in used and "pit stops" not in used
    assert "Do not call the classified leader the fastest" in facts


def test_strategy_endpoint_happy_and_degenerate(monkeypatch):
    from tests.test_strategy import _frames

    laps, stints, pit = _frames()
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    monkeypatch.setattr(m.data_loader, "list_laps", lambda *a, **k: laps)
    monkeypatch.setattr(m.data_loader, "get_stints", lambda *a, **k: stints)
    monkeypatch.setattr(m.data_loader, "get_pit", lambda *a, **k: pit)
    monkeypatch.setattr(m.data_loader, "get_race_control", lambda *a, **k: _frame([]))
    monkeypatch.setattr(
        m,
        "_session_clock",
        lambda sk: (
            start,
            start + pd.Timedelta(hours=1),
            _frame([{"lap_number": 1, "t": 0.0}]),
            3600.0,
        ),
    )
    monkeypatch.setattr(
        m, "session_info", lambda sk: {"session_name": "Race", "total_laps": 20, "drivers": 1}
    )

    with TestClient(m.app) as client:
        params = {"session_key": 1, "driver_number": 1, "from_lap": 12, "laps_remaining": 9}
        body = client.post("/session/strategy", json=params).json()
        assert body["measurable"] is True
        assert body["options"] and body["options"][0]["id"] == "stay"
        assert body["assumptions"]

        unknown = client.post(
            "/session/strategy", json={"session_key": 1, "driver_number": 99, "from_lap": 12}
        )
        assert unknown.status_code == 404

        missing = client.post(
            "/session/strategy", json={"session_key": 1, "driver_number": 1}
        )
        assert missing.status_code == 422


def test_telemetry_endpoint_shapes_and_validation(monkeypatch):

    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    stamps = [(start + pd.Timedelta(seconds=s)).isoformat() for s in (0, 1, 2)]
    frame = _frame(
        {
            "date": stamps,
            "speed": [100, 200, 300],
            "throttle": [50, 80, 100],
            "brake": [0, 0, 100],
            "n_gear": [3, 5, 7],
            "drs": [None, None, None],
        }
    )
    monkeypatch.setattr(
        m.data_loader, "list_drivers", lambda *a, **k: _frame([{"driver_number": 1}])
    )
    monkeypatch.setattr(
        m,
        "_session_clock",
        lambda sk: (
            start,
            start + pd.Timedelta(hours=1),
            _frame([{"lap_number": 1, "t": 0.0}]),
            3600.0,
        ),
    )
    monkeypatch.setattr(m, "_lap_merged_car_loc", lambda *a, **k: frame)

    with TestClient(m.app) as client:
        body = client.post(
            "/session/telemetry",
            json={"session_key": 1, "drivers": [1], "t0": 0, "t1": 10, "points": 300},
        ).json()
        assert body["axis"] == "time"
        assert len(body["t"]) == 300
        series = body["series"][0]
        assert series["driver_number"] == 1
        assert series["speed"][0] == 100
        assert series["drs"] == [None] * 300

        bad = client.post(
            "/session/telemetry",
            json={"session_key": 1, "drivers": [1], "t0": 10, "t1": 5},
        )
        assert bad.status_code == 422


def test_ai_explain_strategy_uses_server_built_facts(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(
        m,
        "session_strategy",
        lambda req: {
            "measurable": True,
            "from_lap": 43,
            "laps_remaining": 14,
            "pit_loss_s": 24.2,
            "pit_loss_source": "median pit-lane time",
            "options": [
                {
                    "rank": 1,
                    "label": "Stay out on HARD",
                    "total_s": 1426.06,
                    "delta_to_best_s": 0.0,
                }
            ],
            "break_even_pit_loss_s": 16.66,
            "undercut": None,
            "coverage": {"clean": 51},
            "assumptions": ["Wear is linear per stint."],
        },
    )
    seen = {}

    def fake_explain(session_key, facts, prompt):
        seen["facts"] = facts
        seen["prompt"] = prompt
        return "Stay out is the call."

    monkeypatch.setattr(m.ai, "explain", fake_explain)
    with TestClient(m.app) as client:
        body = client.post(
            "/ai/explain",
            json={
                "session_key": 1,
                "kind": "strategy",
                "subject": {"driver": 1, "from_lap": 43, "laps_remaining": 14},
            },
        ).json()

    assert body["answer"] == "Stay out is the call."
    assert "Stay out on HARD" in seen["facts"]
    assert "24.2" in seen["facts"]
    assert "do not recalculate" in seen["prompt"]


def test_ai_explain_rejects_unknown_kind(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    with TestClient(m.app) as client:
        res = client.post(
            "/ai/explain",
            json={"session_key": 1, "kind": "weather", "subject": {}},
        )
    assert res.status_code == 422


def test_ai_quota_returns_429(monkeypatch):
    monkeypatch.setattr(m.ai, "configured", lambda: True)
    monkeypatch.setattr(m, "session_strategy", lambda req: {"measurable": True})
    monkeypatch.setattr(
        m.ai,
        "explain",
        lambda *a, **k: (_ for _ in ()).throw(m.ai.AIQuotaExceeded("limit")),
    )
    with TestClient(m.app) as client:
        res = client.post(
            "/ai/explain",
            json={
                "session_key": 1,
                "kind": "strategy",
                "subject": {"driver": 1, "from_lap": 10},
            },
        )
    assert res.status_code == 429
    assert "usage limit" in res.json()["detail"]


def test_timeline_normalizes_weather_and_events(monkeypatch):
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    weather = _frame(
        [
            {
                "date": (start + pd.Timedelta(seconds=60)).isoformat(),
                "track_temperature": 36.5,
                "air_temperature": 26.1,
                "rainfall": 0.0,
            }
        ]
    )
    control = _frame(
        [
            {
                "date": (start + pd.Timedelta(seconds=30)).isoformat(),
                "category": "SafetyCar",
                "message": "VSC DEPLOYED",
                "flag": None,
            },
            {
                "date": (start + pd.Timedelta(seconds=50)).isoformat(),
                "category": "SafetyCar",
                "message": "VSC ENDING",
                "flag": None,
            },
        ]
    )
    monkeypatch.setattr(
        m,
        "_session_clock",
        lambda sk: (
            start,
            start + pd.Timedelta(hours=2),
            _frame([{"lap_number": 1, "t": 10.0}]),
            3600.0,
        ),
    )
    monkeypatch.setattr(m.data_loader, "get_weather", lambda *a, **k: weather)
    monkeypatch.setattr(m.data_loader, "get_race_control", lambda *a, **k: control)

    body = m.session_timeline(1)

    assert body["duration_s"] == 3600.0
    assert body["weather"][0]["t"] == 50.0  # 60 - lights out at 10
    assert body["events"][0]["t"] == 20.0
    assert body["counts"]["vsc"] == 2
