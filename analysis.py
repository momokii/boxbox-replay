"""Pure analysis functions: best laps, deltas, corner loss, tyre slopes. (M2/M5)

M0 status: contract stub. Every function below lands with unit tests in its
milestone (M2: best_lap/deltas/corner loss; M5: tyre slope). They raise
NotImplementedError until then so misuse fails loudly, never silently.
"""

from __future__ import annotations

import pandas as pd

__all__ = ["best_lap", "lap_deltas", "corner_loss", "tyre_slope"]


def best_lap(laps: pd.DataFrame) -> pd.Series:
    """Return the fastest timed lap row. (M2)"""
    raise NotImplementedError("M2: implement best_lap with tests")


def lap_deltas(laps: pd.DataFrame, ref_lap_number: int) -> pd.DataFrame:
    """Per-lap delta vs a reference lap. Delta < 0.05s is noise (coach ignores it). (M2)"""
    raise NotImplementedError("M2: implement lap_deltas with tests")


def corner_loss(car_data: pd.DataFrame, corner_window_m: float = 200.0) -> pd.DataFrame:
    """Time lost per corner vs reference; flags losses > 0.15s. (M2)"""
    raise NotImplementedError("M2: implement corner_loss with tests")


def tyre_slope(laps: pd.DataFrame) -> float:
    """Linear degradation slope (s/lap) for a stint. (M5)"""
    raise NotImplementedError("M5: implement tyre_slope with tests")
