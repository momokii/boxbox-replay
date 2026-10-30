"""M1: locks the analysis stub contract — loud NotImplementedError until M2/M5."""

import pandas as pd
import pytest

import analysis


@pytest.mark.parametrize("fn", [analysis.corner_loss])
def test_remaining_stubs_fail_loudly(fn):
    with pytest.raises(NotImplementedError):
        fn(pd.DataFrame())


LAPS = pd.DataFrame(
    {
        "driver_number": [1, 1, 1, 1],
        "lap_number": [1, 2, 3, 4],
        "lap_duration": [float("nan"), 90.100, 90.120, 91.500],
    }
)


def test_best_lap_ignores_nan():
    row = analysis.best_lap(LAPS)
    assert int(row["lap_number"]) == 2


def test_best_lap_raises_without_timed():
    with pytest.raises(ValueError):
        analysis.best_lap(pd.DataFrame({"lap_duration": [float("nan")]}))


def test_lap_deltas_and_noise_flag():
    out = analysis.lap_deltas(LAPS, ref_lap_number=2)
    by_lap = {int(r.lap_number): r for r in out.itertuples()}
    assert by_lap[2].delta == pytest.approx(0.0)
    assert bool(by_lap[3].is_noise) is True  # 0.020 < 0.05
    assert bool(by_lap[4].is_noise) is False  # 1.400 real
    assert list(out["lap_number"]) == [2, 3, 4]


def test_lap_deltas_rejects_missing_reference():
    with pytest.raises(ValueError):
        analysis.lap_deltas(LAPS, ref_lap_number=99)


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


def test_detect_corners_finds_turns_in_order():
    path = analysis.resample_path(_stadium(), "x", "y")
    corners = analysis.detect_corners(path)
    assert len(corners) >= 2  # a stadium has two rounded ends
    assert corners["label"].tolist() == [f"T{i + 1}" for i in range(len(corners))]
    assert corners["frac"].is_monotonic_increasing
    assert corners["frac"].between(0, 1).all()


def test_resample_path_is_uniform_and_scale_free():
    path = analysis.resample_path(_stadium(), "x", "y", points=200)
    assert len(path) == 200
    assert path["frac"].iloc[0] == 0.0 and path["frac"].iloc[-1] == pytest.approx(1.0)
    steps = path["dist"].diff().dropna()
    assert steps.max() - steps.min() < 1e-6  # uniform spacing


def test_clean_track_points_drops_jumps():
    df = pd.DataFrame({"x": [0, 10, 20, 9000, 30, 40], "y": [0, 0, 0, 0, 0, 0]})
    cleaned = analysis.clean_track_points(df, "x", "y")
    assert 9000 not in cleaned["x"].tolist()
    assert len(cleaned) == 5


def test_detect_corners_empty_on_short_line():
    assert analysis.detect_corners(pd.DataFrame({"x": [0.0, 1.0], "y": [0.0, 0.0]})).empty


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


def test_corner_losses_slower_driver_loses_time():
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


def test_corner_losses_empty_window_is_nan_not_invented():
    outline = pd.DataFrame({"x": [0.0, 1000.0], "y": [0.0, 0.0]})
    corners = pd.DataFrame(
        {"label": ["T1"], "x": [500.0], "y": [0.0], "frac": [0.5], "dist": [500.0]}
    )
    out = analysis.corner_losses(
        outline, corners, pd.DataFrame(), _straight_trace(1000, 8.0), "x", "y"
    )
    assert pd.isna(out.iloc[0]["loss_s"])
    assert bool(out.iloc[0]["flagged"]) is False


def test_map_plane_picks_widest_axes():
    loc = pd.DataFrame({"x": [0.0, 100.0], "y": [0.0, 1.0], "z": [5.0, 5.0]})
    assert analysis.map_plane(loc) == ("x", "y")


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
