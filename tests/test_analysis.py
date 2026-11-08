"""Pure maths: laps, geometry, gaps, pit model, duels. No HTTP, no files."""

import pandas as pd
import pytest

import analysis

LAPS = pd.DataFrame(
    {
        "driver_number": [1, 1, 1, 1],
        "lap_number": [1, 2, 3, 4],
        "lap_duration": [float("nan"), 90.100, 90.120, 91.500],
    }
)
# --- M3: map geometry ---


def _stadium() -> pd.DataFrame:
    import numpy as np

    straight = np.linspace(0, 100, 40)
    top = pd.DataFrame({"x": straight, "y": 0.0})
    angles = np.linspace(-90, 90, 20)
    bend = 20 * np.cos(np.radians(angles))
    lift = 20 + 20 * np.sin(np.radians(angles))
    right = pd.DataFrame({"x": 100 + bend, "y": lift})
    bottom = pd.DataFrame({"x": straight[::-1], "y": 40.0})
    bend2 = 20 * np.cos(np.radians(angles + 180))
    lift2 = 20 + 20 * np.sin(np.radians(angles + 180))
    left = pd.DataFrame({"x": bend2, "y": lift2})
    return pd.concat([top, right, bottom, left], ignore_index=True)
def test_resample_path_is_uniform_and_scale_free():
    path = analysis.resample_path(_stadium(), "x", "y", points=200)
    assert len(path) == 200
    assert path["frac"].iloc[0] == 0.0 and path["frac"].iloc[-1] == pytest.approx(1.0)
    steps = path["dist"].diff().dropna()
    assert steps.max() - steps.min() < 1e-6  # uniform spacing
def test_tyre_slope_linear_deg_and_floor():
    laps = pd.DataFrame({"lap_number": [1, 2, 3, 4], "lap_duration": [90.0, 90.2, 90.4, 90.6]})
    assert analysis.tyre_slope(laps) == pytest.approx(0.2)
    with pytest.raises(ValueError):
        analysis.tyre_slope(laps.iloc[:1])


def test_sector_flags_session_and_personal():
    laps = pd.DataFrame(
        {
            "driver_number": [1, 1, 2, 2],
            "lap_number": [1, 2, 1, 2],
            "duration_sector_1": [30.0, 29.5, 29.5, 31.0],
            "duration_sector_2": [40.0, 40.1, 39.9, 40.2],
            "duration_sector_3": [20.0, 20.0, 20.0, 20.0],
        }
    )
    out = analysis.sector_flags(laps)
    s1 = out.set_index(["driver_number", "lap_number"])["s1_flag"]
    assert s1[(1, 2)] == "session"  # 29.5 is session best, shared -> both session
    assert s1[(2, 1)] == "session"
    s2 = out.set_index(["driver_number", "lap_number"])["s2_flag"]
    assert s2[(2, 1)] == "session" and s2[(1, 1)] == "personal"


def test_drs_zones_bit4_runs():
    trace = pd.DataFrame(
        {
            "drs": [8, 8, 12, 12, 12, 12, 12, 12, 8, 14, 8],
            "x": list(range(11)),
            "y": [0.0] * 11,
        }
    )
    zones = analysis.drs_zones(trace, "x", "y")
    assert len(zones) == 1  # only the 6-point run qualifies
    assert zones.iloc[0]["x0"] == 2.0 and zones.iloc[0]["x1"] == 7.0
    assert analysis.drs_zones(pd.DataFrame(), "x", "y").empty


def test_lap_markers_and_progress():
    laps = pd.DataFrame(
        {
            "driver_number": [1, 1, 1, 2],
            "lap_number": [1, 2, 3, 1],
            "lap_duration": [90.0, 90.0, 90.0, 90.0],
            "date_start": [
                "2024-01-01T00:00:00+00:00",
                "2024-01-01T00:01:30+00:00",
                "2024-01-01T00:03:00+00:00",
                "2024-01-01T00:00:30+00:00",
            ],
        }
    )
    # Markers are per-lap minimum starts (sane laps only), forced monotonic,
    # with a sequential display index.
    markers = analysis.lap_markers(laps, "2024-01-01T00:00:00+00:00")
    assert markers["index"].tolist() == [1, 2, 3]
    assert markers["t"].tolist() == [0.0, 90.0, 180.0]
    assert analysis.leader_progress(markers, -1) == (0, 3)
    assert analysis.leader_progress(markers, 10) == (1, 3)
    assert analysis.leader_progress(markers, 95) == (2, 3)
    explicit = analysis.lap_markers(laps, "2024-01-01T00:00:00+00:00", driver_number=2)
    assert explicit["t"].tolist() == [30.0]


def test_derive_gaps_from_lap_times():
    laps = pd.DataFrame(
        {
            "driver_number": [1, 1, 2, 2],
            "lap_number": [1, 2, 1, 2],
            "lap_duration": [90.0, 90.0, 92.0, 91.0],
        }
    )
    gaps = analysis.derive_gaps(laps)
    at2 = gaps[gaps["lap_number"] == 2].set_index("driver_number")["gap_s"]
    assert at2[1] == 0.0
    assert at2[2] == 3.0


def test_pit_toy_stay_vs_pit_and_traffic():
    stay = analysis.pit_toy_model(90.0, 89.0, 0.2, 10)
    assert stay["recommendation"] == "STAY OUT" and stay["toy_model"] is True
    long = analysis.pit_toy_model(90.0, 89.0, 0.2, 30)
    assert long["recommendation"] == "PIT NOW"
    traffic = analysis.pit_toy_model(90.0, 89.0, 0.2, 30, gap_behind_s=5.0)
    assert traffic["traffic_on_exit"] is True
    clear = analysis.pit_toy_model(90.0, 89.0, 0.2, 30, gap_behind_s=60.0)
    assert clear["traffic_on_exit"] is False
    with pytest.raises(ValueError):
        analysis.pit_toy_model(90.0, 89.0, 0.2, 0)


def _straight_trace(x1: float, seconds: float, n: int = 11) -> pd.DataFrame:
    import numpy as np

    stamps = pd.date_range("2024-01-01", periods=n, freq=f"{seconds / (n - 1):.3f}s")
    return pd.DataFrame(
        {"date": stamps.strftime("%Y-%m-%dT%H:%M:%S.%f+00:00")}
    ).assign(x=np.linspace(0, x1, n), y=0.0)
def test_rotate_points_handles_points_and_segments():
    pts = analysis.rotate_points([{"x": 1.0, "y": 0.0}], 90)
    assert pts[0]["x"] == pytest.approx(0.0, abs=1e-9)
    assert pts[0]["y"] == pytest.approx(1.0)

    seg = analysis.rotate_points(
        [{"x0": 1.0, "y0": 0.0, "x1": 2.0, "y1": 0.0, "label": "DRS1"}], 90
    )
    assert seg[0]["label"] == "DRS1"
    assert seg[0]["y0"] == pytest.approx(1.0)
    assert seg[0]["y1"] == pytest.approx(2.0)
    assert analysis.rotate_points([], 45) == []
    assert analysis.rotate_points([{"x": 1.0, "y": 1.0}], 0)[0] == {"x": 1.0, "y": 1.0}


def test_pit_summary_uses_stop_duration_and_drops_artifacts():
    pits = pd.DataFrame(
        {
            "driver_number": [1, 1, 2, 2],
            "lap_number": [16, 34, 12, 30],
            "stop_duration": [23.1, 23.2, None, 1800.0],
            "pit_duration": [1575.0, 24.0, 25.5, 1801.0],
        }
    )
    out = analysis.pit_summary(pits).set_index("driver_number")
    assert out.loc[1, "stops"] == 2
    assert out.loc[1, "best_stop_s"] == pytest.approx(23.1)
    assert out.loc[1, "laps"] == [16, 34]
    # driver 2: stop_duration missing on one row, the other is a red-flag artifact
    assert out.loc[2, "stops"] == 1
    assert out.loc[2, "best_stop_s"] == pytest.approx(25.5)
    assert analysis.pit_summary(pd.DataFrame()).empty


def test_overtake_counts_made_and_lost():
    ov = pd.DataFrame(
        {
            "overtaking_driver_number": [1, 1, 2],
            "overtaken_driver_number": [3, 4, 1],
        }
    )
    out = analysis.overtake_counts(ov).set_index("driver_number")
    assert out.loc[1, "made"] == 2 and out.loc[1, "lost"] == 1
    assert out.loc[3, "lost"] == 1 and out.loc[3, "made"] == 0
    assert analysis.overtake_counts(pd.DataFrame()).empty


def test_position_at_uses_latest_sample():
    pos = pd.DataFrame(
        {
            "driver_number": [1, 1, 2],
            "t": [0, 100, 50],
            "position": [3, 1, 4],
        }
    )
    assert analysis.position_at(pos, 60) == {1: 3, 2: 4}
    assert analysis.position_at(pos, 150) == {1: 1, 2: 4}
    assert analysis.position_at(pos, -5) == {}
    assert analysis.position_at(pd.DataFrame(), 10) == {}


def _circle_lap(seconds: float, start: str = "2024-01-01T00:00:00+00:00", n: int = 400):
    """A synthetic lap: one full circle at 1 Hz, `seconds` long."""
    import numpy as np

    stamp = pd.Timestamp(start)
    t = np.linspace(0, seconds, n)
    return pd.DataFrame(
        {
            "date": [(stamp + pd.Timedelta(seconds=float(v))).isoformat() for v in t],
            "x": np.cos(2 * np.pi * t / seconds) * 1000,
            "y": np.sin(2 * np.pi * t / seconds) * 1000,
            "t_true": t,
        }
    )


def test_lap_progress_covers_the_whole_lap():
    import analysis

    lap = _circle_lap(90)
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    trace = analysis.lap_progress(lap, start, start + pd.Timedelta(seconds=90), duration=90)

    assert len(trace) == 600
    assert trace["f"].iloc[0] == 0.0
    assert trace["f"].iloc[-1] == pytest.approx(1.0)
    assert trace["t"].iloc[0] == pytest.approx(0.0, abs=0.02)
    assert trace["t"].iloc[-1] == pytest.approx(90.0, abs=0.5)
    assert trace["t"].is_monotonic_increasing


def test_duel_delta_equals_lap_time_gap_at_the_line():
    import analysis

    fast = _circle_lap(90)
    slow = _circle_lap(91)
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    end = start + pd.Timedelta(seconds=91)
    a = analysis.lap_progress(fast, start, end, duration=90)
    b = analysis.lap_progress(slow, start, end, duration=91)
    delta = analysis.duel_delta(a, b)

    assert delta["dt"].iloc[0] == pytest.approx(0.0, abs=0.01)
    # B took one extra second for the same lap, but it also had more time in
    # the window; at equal *progress* B is behind by the pace difference.
    assert delta["dt"].iloc[-1] > 0.5
    assert delta["dt"].iloc[-1] == pytest.approx(1.0, abs=0.05)
def test_pit_model_exposes_the_arithmetic():
    call = analysis.pit_toy_model(100.0, 99.0, 0.2, 10, pit_loss_s=5.0)
    # deg term cancels: 10 laps at +0.2/lap = 9.0s in both totals
    assert call["deg_total_s"] == pytest.approx(9.0)
    assert call["stay_total_s"] == pytest.approx(1009.0)
    assert call["pit_total_s"] == pytest.approx(5.0 + 990.0 + 9.0)
    # break-even is 10 * (100 - 99) = 10s; a 5s stop is under it, so pit wins
    assert call["break_even_pit_loss_s"] == pytest.approx(10.0)
    assert call["stay_advantage_s"] == pytest.approx(-5.0)
    assert call["recommendation"] == "PIT NOW"

    # Above the break-even the call flips, and degradation does not change that.
    expensive = analysis.pit_toy_model(100.0, 99.0, 0.2, 10, pit_loss_s=15.0)
    assert expensive["break_even_pit_loss_s"] == pytest.approx(10.0)
    assert expensive["recommendation"] == "STAY OUT"
    assert expensive["stay_advantage_s"] == pytest.approx(5.0)

    # Traffic eats five seconds of the break-even budget.
    traffic = analysis.pit_toy_model(100.0, 99.0, 0.2, 10, pit_loss_s=5.0, gap_behind_s=1.0)
    assert traffic["traffic_penalty_s"] == pytest.approx(5.0)
    assert traffic["break_even_pit_loss_s"] == pytest.approx(5.0)


def test_best_lap_and_deltas():
    row = analysis.best_lap(LAPS)
    assert int(row["lap_number"]) == 2
    with pytest.raises(ValueError):
        analysis.best_lap(pd.DataFrame({"lap_duration": [float("nan")]}))

    out = analysis.lap_deltas(LAPS, ref_lap_number=2)
    by_lap = {int(r.lap_number): r for r in out.itertuples()}
    assert by_lap[2].delta == pytest.approx(0.0)
    assert bool(by_lap[3].is_noise) is True  # 0.020 < 0.05
    assert bool(by_lap[4].is_noise) is False  # 1.400 real
    assert list(out["lap_number"]) == [2, 3, 4]
    with pytest.raises(ValueError):
        analysis.lap_deltas(LAPS, ref_lap_number=99)


def test_detect_corners_labels_and_order():
    path = analysis.resample_path(_stadium(), "x", "y")
    corners = analysis.detect_corners(path)
    assert len(corners) >= 2  # a stadium has two rounded ends
    assert corners["label"].tolist() == [f"T{i + 1}" for i in range(len(corners))]
    assert corners["frac"].is_monotonic_increasing
    assert corners["frac"].between(0, 1).all()
    assert analysis.detect_corners(pd.DataFrame({"x": [0.0, 1.0], "y": [0.0, 0.0]})).empty


def test_clean_track_points_drops_a_spike_but_keeps_the_lap():
    # One telemetry gap used to discard the rest of the lap (2026 US GP: 36%
    # missing). The spike goes; every later sample stays.
    xs = list(range(0, 100, 10)) + [9000] + list(range(100, 140, 10))
    frame = pd.DataFrame({"x": xs, "y": 0.0})
    cleaned = analysis.clean_track_points(frame, "x", "y")
    assert 9000 not in cleaned["x"].tolist()
    assert cleaned["x"].iloc[-1] == frame["x"].iloc[-1]
    assert len(cleaned) == len(frame) - 1
    # A normal trace is untouched.
    normal = pd.DataFrame({"x": list(range(0, 60, 10)), "y": 0.0})
    assert len(analysis.clean_track_points(normal, "x", "y")) == len(normal)


def test_lap_progress_rejects_empty_windows():
    start = pd.Timestamp("2024-01-01T00:00:00+00:00")
    assert analysis.lap_progress(pd.DataFrame(), start, start).empty

def test_corner_losses_measures_and_refuses_empty_windows():
    outline = pd.DataFrame({"x": [0.0, 1000.0], "y": [0.0, 0.0]})
    corners = pd.DataFrame(
        {"label": ["T1"], "x": [500.0], "y": [0.0], "frac": [0.5], "dist": [500.0]}
    )
    # +-0.035 of a 1000-unit lap covers 60 sampled units here: 0.6 s vs 0.48 s.
    out = analysis.corner_losses(
        outline,
        corners,
        _straight_trace(1000, 10.0, n=101),
        _straight_trace(1000, 8.0, n=101),
        "x",
        "y",
    )
    assert out.iloc[0]["loss_s"] == pytest.approx(0.12, abs=0.02)

    empty = analysis.corner_losses(
        outline, corners, pd.DataFrame(), _straight_trace(1000, 8.0), "x", "y"
    )
    assert pd.isna(empty.iloc[0]["loss_s"])  # never invented
    assert bool(empty.iloc[0]["flagged"]) is False
