"""Pure analysis functions: best laps, deltas, corner loss, tyre slopes. (M2/M5)

M0 status: contract stub. Every function below lands with unit tests in its
milestone (M2: best_lap/deltas/corner loss; M5: tyre slope). They raise
NotImplementedError until then so misuse fails loudly, never silently.
"""

from __future__ import annotations

import pandas as pd

__all__ = ["best_lap", "lap_deltas", "corner_loss", "tyre_slope", "NOISE_THRESHOLD"]

#: Deltas below this (seconds) are noise — the coach must say so, not explain it.
NOISE_THRESHOLD = 0.05
#: Corner losses above this (seconds) are worth the engineer's attention.
CORNER_LOSS_THRESHOLD = 0.15


def _timed(laps: pd.DataFrame) -> pd.DataFrame:
    """Laps with a measured duration, numeric and finite."""
    timed = laps.dropna(subset=["lap_duration"]).copy()
    timed["lap_duration"] = pd.to_numeric(timed["lap_duration"], errors="coerce")
    return timed.dropna(subset=["lap_duration"])


def best_lap(laps: pd.DataFrame) -> pd.Series:
    """Return the fastest timed lap row. Raises ValueError when none timed."""
    timed = _timed(laps)
    if timed.empty:
        raise ValueError("no timed laps")
    return timed.loc[timed["lap_duration"].idxmin()]


def lap_deltas(laps: pd.DataFrame, ref_lap_number: int) -> pd.DataFrame:
    """Per-lap delta vs a reference lap (seconds, + slower). Includes is_noise."""
    timed = _timed(laps)
    ref = timed[timed["lap_number"] == ref_lap_number]
    if ref.empty:
        raise ValueError(f"reference lap {ref_lap_number} has no timed lap")
    ref_time = float(ref.iloc[0]["lap_duration"])
    out = timed[["driver_number", "lap_number", "lap_duration"]].copy()
    out["delta"] = out["lap_duration"] - ref_time
    out["is_noise"] = out["delta"].abs() < NOISE_THRESHOLD
    return out.sort_values("lap_number", ignore_index=True)


def corner_loss(car_data: pd.DataFrame, corner_window_m: float = 200.0) -> pd.DataFrame:
    """Time lost per corner vs reference; flags losses > 0.15s. (M4 with map geometry)"""
    raise NotImplementedError("M4: implement corner_loss with tests")


def tyre_slope(laps: pd.DataFrame) -> float:
    """Linear degradation slope (s/lap) for a stint. (M5)"""
    raise NotImplementedError("M5: implement tyre_slope with tests")
