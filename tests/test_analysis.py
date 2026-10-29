"""M1: locks the analysis stub contract — loud NotImplementedError until M2/M5."""

import pandas as pd
import pytest

import analysis


@pytest.mark.parametrize("fn", [analysis.corner_loss, analysis.tyre_slope])
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
    corners = analysis.detect_corners(_stadium())
    assert len(corners) >= 2  # two 180-degree ends, split into entry/apex/exit peaks
    assert corners["label"].tolist() == [f"T{i + 1}" for i in range(len(corners))]
    assert corners["idx"].is_monotonic_increasing


def test_detect_corners_empty_on_short_line():
    assert analysis.detect_corners(pd.DataFrame({"x": [0.0, 1.0], "y": [0.0, 0.0]})).empty


def test_map_plane_picks_widest_axes():
    loc = pd.DataFrame({"x": [0.0, 100.0], "y": [0.0, 1.0], "z": [5.0, 5.0]})
    assert analysis.map_plane(loc) == ("x", "y")
