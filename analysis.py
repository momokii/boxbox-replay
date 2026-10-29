"""Pure analysis functions: best laps, deltas, corner loss, tyre slopes. (M2/M5)

M0 status: contract stub. Every function below lands with unit tests in its
milestone (M2: best_lap/deltas/corner loss; M5: tyre slope). They raise
NotImplementedError until then so misuse fails loudly, never silently.
"""

from __future__ import annotations

import pandas as pd

__all__ = [
    "best_lap",
    "lap_deltas",
    "corner_loss",
    "corner_losses",
    "tyre_slope",
    "detect_corners",
    "map_plane",
    "NOISE_THRESHOLD",
    "CORNER_LOSS_THRESHOLD",
]

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
    """Time lost per corner vs reference; flags losses > 0.15s. (M4: see corner_losses)"""
    raise NotImplementedError("M4: use corner_losses with map geometry")


# --- M3: map geometry (pure; ordering comes from the telemetry timestamps) ---


def map_plane(loc: pd.DataFrame) -> tuple[str, str]:
    """The two coordinate columns with the largest spread form the track plane."""
    spread = {c: float(loc[c].std()) for c in ("x", "y", "z") if c in loc.columns}
    if len(spread) < 2:
        raise ValueError("location needs at least two coordinate columns")
    ranked = sorted(spread, key=spread.get, reverse=True)
    return ranked[0], ranked[1]


def detect_corners(
    line: pd.DataFrame, angle_deg: float = 25.0, min_gap: int = 8
) -> pd.DataFrame:
    """Find corners on an ordered (x, y) reference line via heading change.

    Returns one row per corner: label (T1..Tn), x, y, idx. Pure and tested.
    """
    import math

    import numpy as np

    pts = line[["x", "y"]].to_numpy(dtype=float)
    if len(pts) < min_gap * 2:
        return pd.DataFrame(columns=["label", "x", "y", "idx"])
    seg = np.diff(pts, axis=0)
    heading = np.arctan2(seg[:, 1], seg[:, 0])
    turn = (np.diff(heading) + math.pi) % (2 * math.pi) - math.pi
    smooth = pd.Series(np.abs(turn)).rolling(5, center=True, min_periods=1).mean().to_numpy()
    thresh = math.radians(angle_deg)
    peaks: list[int] = []
    i = 0
    while i < len(smooth):
        if smooth[i] >= thresh:
            j = i
            while j + 1 < len(smooth) and smooth[j + 1] >= thresh:
                j += 1
            peak = (i + j) // 2
            if not peaks or peak - peaks[-1] >= min_gap:
                peaks.append(peak)
            i = j + 1
        else:
            i += 1
    return pd.DataFrame(
        {"label": [f"T{n + 1}" for n in range(len(peaks))],
         "x": [float(pts[p + 1][0]) for p in peaks],
         "y": [float(pts[p + 1][1]) for p in peaks],
         "idx": peaks}
    )


def _cumdist(trace: pd.DataFrame, ax: str, ay: str) -> pd.Series:
    """Cumulative metres along an ordered (ax, ay) trace."""
    import numpy as np

    pts = trace[[ax, ay]].to_numpy(dtype=float)
    steps = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    return pd.Series(np.concatenate([[0.0], np.cumsum(steps)]), index=trace.index)


def _window_seconds(trace: pd.DataFrame, ax: str, ay: str, apex: float, window_m: float):
    """Seconds spent inside [apex-window_m, apex+window_m]; None when empty."""
    if trace.empty:
        return None
    d = _cumdist(trace, ax, ay)
    inside = trace[(d >= apex - window_m) & (d <= apex + window_m)]
    if inside.empty:
        return None
    stamps = pd.to_datetime(trace["date"], utc=True)
    return (stamps.loc[inside.index].max() - stamps.loc[inside.index].min()).total_seconds()


def corner_losses(
    outline: pd.DataFrame,
    corners: pd.DataFrame,
    trace_self: pd.DataFrame,
    trace_ref: pd.DataFrame,
    ax: str,
    ay: str,
    window_m: float = 200.0,
) -> pd.DataFrame:
    """Seconds lost per corner (self vs ref) inside +/-window_m of each apex.

    Apex distance comes from the outline via the corner's outline idx.
    Empty window in either trace -> NaN loss (never invented). Pure.
    """
    out = []
    out_dist = _cumdist(outline, "x", "y")
    for c in corners.itertuples():
        idx = int(c.idx)
        apex = float(out_dist.iloc[idx]) if 0 <= idx < len(out_dist) else None
        loss: float | None = None
        if apex is not None:
            t_self = _window_seconds(trace_self, ax, ay, apex, window_m)
            t_ref = _window_seconds(trace_ref, ax, ay, apex, window_m)
            if t_self is not None and t_ref is not None:
                loss = t_self - t_ref
        out.append(
            {
                "label": c.label,
                "loss_s": loss,
                "flagged": bool(loss is not None and loss > CORNER_LOSS_THRESHOLD),
            }
        )
    return pd.DataFrame(out)


def tyre_slope(laps: pd.DataFrame) -> float:
    """Linear degradation slope (s/lap) via least squares on lap vs duration.

    Raises ValueError with fewer than 2 timed laps. Pure.
    """
    timed = _timed(laps).sort_values("lap_number")
    if len(timed) < 2:
        raise ValueError("need at least 2 timed laps for a slope")
    x = timed["lap_number"].to_numpy(dtype=float)
    y = timed["lap_duration"].to_numpy(dtype=float)
    slope = float(((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum())
    return slope
