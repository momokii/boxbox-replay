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
