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
    "sector_flags",
    "drs_zones",
    "lap_markers",
    "leader_progress",
    "derive_gaps",
    "pit_toy_model",
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
    """The horizontal plane for the track map: always (x, y). Pure.

    OpenF1 positions are already a top-down plane in x/y (z is elevation).
    Choosing axes by spread used to swap them for some circuits (e.g. Monaco),
    which put the drawn circuit and the cars in different projections.
    """
    if "x" in loc.columns and "y" in loc.columns:
        return "x", "y"
    present = [c for c in ("x", "y", "z") if c in loc.columns]
    if len(present) < 2:
        raise ValueError("location needs at least two coordinate columns")
    return present[0], present[1]


def clean_track_points(trace: pd.DataFrame, ax: str, ay: str) -> pd.DataFrame:
    """Drop position glitches using a unit-agnostic step test.

    OpenF1 /location coordinates are not metres (they are roughly 10x), so the
    test is relative: a sample survives unless it jumps more than 6x the median
    frame-to-frame step — something no car does. Pure.
    """
    import numpy as np

    if trace.empty or ax not in trace.columns or ay not in trace.columns:
        return trace
    df = trace.reset_index(drop=True)
    if len(df) < 4:
        return df
    pts = df[[ax, ay]].to_numpy(dtype=float)
    steps = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    finite = steps[np.isfinite(steps) & (steps > 0)]
    if not len(finite):
        return df.iloc[:1].reset_index(drop=True)
    limit = float(np.median(finite)) * 6.0
    keep = [0]
    for i in range(1, len(df)):
        if float(np.linalg.norm(pts[i] - pts[keep[-1]])) <= limit:
            keep.append(i)
    return df.iloc[keep].reset_index(drop=True)


def resample_path(
    trace: pd.DataFrame, ax: str, ay: str, points: int = 1500
) -> pd.DataFrame:
    """Resample an ordered trace uniformly by arc length. Pure.

    Returns x, y, frac (0..1 around the lap) and dist (raw coordinate units).
    Everything downstream works in `frac`, so it is independent of the source
    coordinate scale and of the telemetry sample rate.
    """
    import numpy as np

    if trace.empty or ax not in trace.columns or ay not in trace.columns:
        return pd.DataFrame(columns=["x", "y", "frac", "dist"])
    pts = trace[[ax, ay]].to_numpy(dtype=float)
    if len(pts) < 3:
        return pd.DataFrame(columns=["x", "y", "frac", "dist"])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = float(cum[-1])
    if not np.isfinite(total) or total <= 0:
        return pd.DataFrame(columns=["x", "y", "frac", "dist"])
    grid = np.linspace(0.0, total, max(50, points))
    x = np.interp(grid, cum, pts[:, 0])
    y = np.interp(grid, cum, pts[:, 1])
    return pd.DataFrame({"x": x, "y": y, "frac": grid / total, "dist": grid})


def start_angle(path: pd.DataFrame, span: float = 0.06) -> float:
    """Angle (degrees) of the start/finish straight, for map orientation. Pure.

    Track maps are far easier to read when the start straight is horizontal;
    this returns the rotation needed, normalised to (-90, 90] so the map is
    never upside down.
    """
    import numpy as np

    if path.empty or len(path) < 20:
        return 0.0
    frac = path["frac"].to_numpy(dtype=float)
    idx = np.where(frac <= span)[0]
    if len(idx) < 3:
        idx = np.arange(min(len(path) - 1, 10))
    i, j = int(idx[0]), int(idx[-1])
    dx = float(path["x"].iloc[j] - path["x"].iloc[i])
    dy = float(path["y"].iloc[j] - path["y"].iloc[i])
    if dx == 0 and dy == 0:
        return 0.0
    deg = np.degrees(np.arctan2(dy, dx))
    if deg > 90:
        deg -= 180
    elif deg <= -90:
        deg += 180
    return float(deg)


def rotate_path(path: pd.DataFrame, angle_deg: float) -> pd.DataFrame:
    """Rotate x/y about the origin (same transform is applied to car dots)."""
    import numpy as np

    if path.empty or angle_deg == 0:
        return path
    a = np.radians(angle_deg)
    cos, sin = np.cos(a), np.sin(a)
    x = path["x"].to_numpy(dtype=float)
    y = path["y"].to_numpy(dtype=float)
    out = path.copy()
    out["x"] = x * cos - y * sin
    out["y"] = x * sin + y * cos
    return out


def rotate_points(points: list[dict], angle_deg: float) -> list[dict]:
    """Rotate a list of {x, y, ...} dicts by `angle_deg` about the origin."""
    import math

    if not points or angle_deg == 0:
        return points
    a = math.radians(angle_deg)
    cos, sin = math.cos(a), math.sin(a)
    out = []
    for p in points:
        x, y = float(p["x"]), float(p["y"])
        q = dict(p)
        q["x"] = x * cos - y * sin
        q["y"] = x * sin + y * cos
        out.append(q)
    return out


def detect_corners(path: pd.DataFrame, target: int | None = None) -> pd.DataFrame:
    """Find corner apexes on a uniform path via heading change. Pure.

    Works in fractions of lap length, so the same thresholds fit a 4 km circuit
    and a 7 km one. `target` defaults to a plausible corner count for the
    circuit; labels are sequential (T1..Tn) — detected curvature, not official
    FIA numbering.
    """
    import numpy as np

    empty = pd.DataFrame(columns=["label", "x", "y", "frac", "dist"])
    if path.empty or len(path) < 24:
        return empty
    pts = path[["x", "y"]].to_numpy(dtype=float)
    frac = path["frac"].to_numpy(dtype=float)
    dist = path["dist"].to_numpy(dtype=float)

    heading = np.arctan2(np.diff(pts[:, 1]), np.diff(pts[:, 0]))
    win = max(3, int(round(len(pts) * 0.006)))
    turn = np.zeros(len(pts))
    for i in range(len(pts)):
        a = max(0, i - win)
        b = min(len(heading), i + win)
        if b - a >= 2:
            dh = (heading[b - 1] - heading[a] + np.pi) % (2 * np.pi) - np.pi
            turn[i] = abs(np.degrees(dh))

    goal = target if target is not None else 18  # typical F1 circuit corner count
    min_sep = 0.012  # ~70 m on a 5.8 km lap, as a fraction
    best: list[int] = []
    for thresh in (26, 24, 22, 20, 18, 16, 14, 12, 10):
        peaks: list[int] = []
        for i in range(1, len(turn) - 1):
            if turn[i] < thresh:
                continue
            if turn[i] < turn[i - 1] or turn[i] < turn[i + 1]:
                continue
            if peaks and frac[i] - frac[peaks[-1]] < min_sep:
                if turn[i] > turn[peaks[-1]]:
                    peaks[-1] = i
                continue
            peaks.append(i)
        best = peaks
        if len(peaks) >= goal:
            break
    if len(best) > goal:
        keep = sorted(sorted(best, key=lambda i: turn[i], reverse=True)[:goal])
        best = keep
    if not best:
        return empty
    return pd.DataFrame(
        {
            "label": [f"T{n + 1}" for n in range(len(best))],
            "x": [float(pts[i][0]) for i in best],
            "y": [float(pts[i][1]) for i in best],
            "frac": [float(frac[i]) for i in best],
            "dist": [float(dist[i]) for i in best],
        }
    )


def _path_total(df: pd.DataFrame, ax: str, ay: str) -> float:
    """Total length of an ordered path in source coordinate units."""
    import numpy as np

    if df.empty or ax not in df.columns or ay not in df.columns:
        return 0.0
    pts = df[[ax, ay]].to_numpy(dtype=float)
    if len(pts) < 2:
        return 0.0
    return float(np.sum(np.linalg.norm(np.diff(pts, axis=0), axis=1)))


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
    window_frac: float = 0.035,
) -> pd.DataFrame:
    """Seconds lost per corner (self vs ref) inside +/-window_m of each apex.

    Apex distance comes from the outline via the corner's outline idx.
    Empty window in either trace -> NaN loss (never invented). Pure.
    """
    out = []
    total = _path_total(outline, ax, ay)
    for c in corners.itertuples():
        apex = float(c.frac) * total if total > 0 and hasattr(c, "frac") else None
        window_units = window_frac * total
        loss: float | None = None
        if apex is not None:
            t_self = _window_seconds(trace_self, ax, ay, apex, window_units)
            t_ref = _window_seconds(trace_ref, ax, ay, apex, window_units)
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


# --- M7: sector flags + DRS zones (pure) ---


def lap_markers(
    laps: pd.DataFrame, session_start, driver_number: int | None = None
) -> pd.DataFrame:
    """lap_number -> t (seconds from session start): robust session clock. Pure.

    Lap starts from different cars are not comparable (a car leaving the pits
    starts 'lap 2' minutes later), and single-car data can carry red-flag
    artifacts, so each marker is the MEDIAN start time across cars, forced
    monotonic. With `driver_number`, that car's own starts are used instead.
    """
    if laps.empty or "date_start" not in laps.columns:
        return pd.DataFrame(columns=["lap_number", "index", "t"])
    df = laps.copy()
    stamps = pd.to_datetime(df["date_start"], format="mixed", utc=True)
    df = df.assign(t=(stamps - pd.Timestamp(session_start)).dt.total_seconds())
    df = df[df["t"] >= 0]
    if driver_number is not None:
        df = df[df["driver_number"] == driver_number]
    # Drop red-flag/data-artifact laps: they are many times a normal lap.
    timed = pd.to_numeric(df.get("lap_duration"), errors="coerce")
    df = df.assign(_dur=timed).dropna(subset=["_dur"])
    if df.empty:
        return pd.DataFrame(columns=["lap_number", "index", "t"])
    typical = float(df["_dur"].median())
    df = df[df["_dur"] <= typical * 1.6]
    if df.empty:
        return pd.DataFrame(columns=["lap_number", "index", "t"])
    grouped = df.groupby("lap_number", as_index=False)["t"].min().sort_values("lap_number")
    # A later lap can never start before an earlier one.
    grouped["t"] = grouped["t"].cummax()
    grouped = grouped.reset_index(drop=True)
    # Display index is sequential (source lap numbers can have gaps after an
    # aborted start); the timeline is about progress, not raw numbering.
    grouped["index"] = range(1, len(grouped) + 1)
    return grouped[["lap_number", "index", "t"]]


def leader_progress(markers: pd.DataFrame, t: float) -> tuple[int, int]:
    """(current_lap_index, total) at time t from sequential lap markers. Pure."""
    if markers.empty:
        return 0, 0
    key = "index" if "index" in markers.columns else "lap_number"
    labels = markers[key].to_numpy()
    times = markers["t"].to_numpy(dtype=float)
    total = int(labels.max())
    idx = int((times <= t).sum()) - 1
    if idx < 0:
        return 0, total
    return int(labels[min(idx, len(labels) - 1)]), total


def derive_gaps(laps: pd.DataFrame) -> pd.DataFrame:
    """Gap to leader at each lap boundary from real lap times. Pure.

    Used only when /intervals is missing: cumulative time is summed from the
    measured lap durations (never invented). Returns lap_number, driver_number,
    cum_s, gap_s.
    """
    if laps.empty or "lap_duration" not in laps.columns:
        return pd.DataFrame(columns=["lap_number", "driver_number", "cum_s", "gap_s"])
    df = laps.dropna(subset=["lap_duration"]).copy()
    df["lap_duration"] = pd.to_numeric(df["lap_duration"], errors="coerce")
    df = df.dropna(subset=["lap_duration"])
    # Red-flag / data artifacts show up as laps many times longer than typical.
    if not df.empty:
        typical = float(df["lap_duration"].median())
        df = df[df["lap_duration"] <= typical * 1.6]
    df = df.sort_values(["driver_number", "lap_number"])
    if df.empty:
        return pd.DataFrame(columns=["lap_number", "driver_number", "cum_s", "gap_s"])
    df["cum_s"] = df.groupby("driver_number")["lap_duration"].cumsum()
    df["gap_s"] = df["cum_s"] - df.groupby("lap_number")["cum_s"].transform("min")
    return df[["lap_number", "driver_number", "cum_s", "gap_s"]].reset_index(drop=True)


def sector_flags(laps: pd.DataFrame) -> pd.DataFrame:
    """Per-lap sector labels: 'session' (fastest of session), 'personal'
    (driver's best), or '' — for F1-standard purple/green coloring. Pure.
    """
    out = laps[["driver_number", "lap_number"]].copy()
    for i in (1, 2, 3):
        col = f"duration_sector_{i}"
        flag = f"s{i}_flag"
        out[flag] = ""
        if col not in laps.columns:
            continue
        sec = pd.to_numeric(laps[col], errors="coerce")
        session_best = sec.min()
        personal_best = laps.assign(_s=sec).groupby("driver_number")["_s"].transform("min")
        out.loc[sec == session_best, flag] = "session"
        out.loc[(sec == personal_best) & (out[flag] == ""), flag] = "personal"
    return out


def drs_zones(trace: pd.DataFrame, ax: str, ay: str, min_points: int = 5) -> pd.DataFrame:
    """DRS-open segments on a trace: rows where bit4 of `drs` is set (12/14),
    grouped into contiguous runs. Returns label/x0/y0/x1/y1 per zone. Pure.
    """
    if trace.empty or "drs" not in trace.columns:
        return pd.DataFrame(columns=["label", "x0", "y0", "x1", "y1"])
    drs = pd.to_numeric(trace["drs"], errors="coerce").fillna(0).astype(int).to_numpy()
    open_mask = (drs & 4) != 0
    zones = []
    i = 0
    while i < len(trace):
        if open_mask[i]:
            j = i
            while j + 1 < len(trace) and open_mask[j + 1]:
                j += 1
            if j - i + 1 >= min_points:
                zones.append(
                    {
                        "label": f"DRS{len(zones) + 1}",
                        "x0": float(trace.iloc[i][ax]),
                        "y0": float(trace.iloc[i][ay]),
                        "x1": float(trace.iloc[j][ax]),
                        "y1": float(trace.iloc[j][ay]),
                    }
                )
            i = j + 1
        else:
            i += 1
    return pd.DataFrame(zones, columns=["label", "x0", "y0", "x1", "y1"])


# --- M6: what-if pit toy model (explicitly NOT strategy advice) ---


def pit_toy_model(
    base_pace_s: float,
    fresh_pace_s: float,
    deg_slope_s_per_lap: float,
    laps_remaining: int,
    pit_loss_s: float = 22.0,
    gap_behind_s: float | None = None,
) -> dict:
    """Toy pit call: linear deg, constant rival pace, static pit loss.

    STAY OUT (current pace + slope*i) vs PIT NOW (pit_loss + fresh pace
    + slope restarted). Traffic check: pitting when gap_behind < pit_loss
    emerges behind — flagged, not modeled. Pure.
    """
    if laps_remaining < 1:
        raise ValueError("laps_remaining must be >= 1")
    deg = max(0.0, float(deg_slope_s_per_lap))
    stay_total = sum(base_pace_s + deg * i for i in range(laps_remaining))
    pit_total = float(pit_loss_s) + sum(fresh_pace_s + deg * i for i in range(laps_remaining))
    traffic = gap_behind_s is not None and gap_behind_s < float(pit_loss_s)
    recommend = "STAY OUT"
    if pit_total + (5.0 if traffic else 0.0) < stay_total:
        recommend = "PIT NOW"
    return {
        "stay_total_s": stay_total,
        "pit_total_s": pit_total,
        "recommendation": recommend,
        "traffic_on_exit": bool(traffic),
        "toy_model": True,
    }
