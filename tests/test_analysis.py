"""M0: locks the analysis stub contract — loud NotImplementedError until M2/M5."""

import pandas as pd
import pytest

import analysis

CASES = [
    (analysis.best_lap, (pd.DataFrame(),)),
    (analysis.lap_deltas, (pd.DataFrame(), 1)),
    (analysis.corner_loss, (pd.DataFrame(),)),
    (analysis.tyre_slope, (pd.DataFrame(),)),
]


@pytest.mark.parametrize(("fn", "args"), CASES, ids=[f.__name__ for f, _ in CASES])
def test_stubs_fail_loudly_not_silently(fn, args):
    with pytest.raises(NotImplementedError):
        fn(*args)
