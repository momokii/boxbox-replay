"""OpenF1 fetch layer: rate-limited, retried, parquet-cached. (M0)

Rules honored here:
- Max ~3 req/s against api.openf1.org (throttle + retry with backoff on 429/5xx).
- Every response cached as parquet under data/cache/; cache hit never touches network.
- Empty telemetry (e.g. no car_data for a session) returns an empty DataFrame —
  callers (M1 picker) hide such sessions with reason "no telemetry". Never fake.
"""

from __future__ import annotations

import os
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = os.getenv("OPENF1_BASE_URL", "https://api.openf1.org/v1").rstrip("/")
CACHE_ROOT = Path(os.getenv("CACHE_DIR", "data/cache"))

# OpenF1 free tier: max 3 requests/second. 0.4s spacing keeps us safely under.
RATE_MIN_INTERVAL_S = 0.4
MAX_RETRIES = 4
RETRYABLE_STATUS = {429, 500, 502, 503, 504}

_last_call_ts = 0.0


def _throttle() -> None:
    """Sleep just enough to stay under the 3 req/s limit."""
    global _last_call_ts
    wait = RATE_MIN_INTERVAL_S - (time.monotonic() - _last_call_ts)
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.monotonic()


def _fetch(endpoint: str, params: dict | None = None) -> list[dict]:
    """GET BASE_URL/endpoint with throttle + retry. Returns parsed JSON list.

    404 means "no data for this filter" — returned as [] so callers show
    empty states instead of crashing. Only 429/5xx and network errors retry.
    """
    url = f"{BASE_URL}/{endpoint.lstrip('/')}"
    last_error: Exception | None = None
    with httpx.Client(timeout=30.0, headers={"User-Agent": "boxbox-replay-m0"}) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            _throttle()
            try:
                resp = client.get(url, params=params or {})
                if resp.status_code == 404:
                    return []
                if resp.status_code in RETRYABLE_STATUS:
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, list) else []
            except httpx.HTTPStatusError:
                raise
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                time.sleep(2**attempt)
    raise RuntimeError(f"OpenF1 fetch failed after {MAX_RETRIES} tries: {url} ({last_error})")


def _slug(text: str) -> str:
    """Filesystem-safe slug for cache path parts."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in text).strip("_") or "unknown"


def to_dt(series: pd.Series) -> pd.Series:
    """Parse mixed ISO8601 timestamps (with/without microseconds) to UTC."""
    return pd.to_datetime(series, format="mixed", utc=True)


def _cache_path(*parts: str) -> Path:
    *dirs, filename = parts
    path = CACHE_ROOT.joinpath(*[_slug(p) for p in dirs], filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _session_cache(session_key: int, filename: str) -> Path:
    """Session-keyed cache file. M1 migrates to <year>/<gp>/<session> shape."""
    return _cache_path("by_session_key", str(session_key), filename)


def _cached(endpoint: str, params: dict | None, cache_file: Path) -> pd.DataFrame:
    """Return cached parquet if present, else fetch, cache (even if empty), return."""
    if cache_file.exists():
        return pd.read_parquet(cache_file)
    rows = _fetch(endpoint, params)
    df = pd.DataFrame(rows)
    df.to_parquet(cache_file, index=False)
    return df


def list_years() -> list[int]:
    """Years with free historical OpenF1 data: 2023 through the current year."""
    return list(range(2023, datetime.now(UTC).year + 1))


def list_sessions(year: int) -> pd.DataFrame:
    """All sessions for a year, enriched with meeting_name from /meetings.

    Cached at data/cache/<year>/_sessions.parquet. Stale caches from before
    the meeting_name join are detected and refreshed.
    """
    cache_file = _cache_path(str(year), "_sessions.parquet")
    if cache_file.exists():
        cached = pd.read_parquet(cache_file)
        if "meeting_name" in cached.columns:
            return cached
        cache_file.unlink()
    sessions = pd.DataFrame(_fetch("sessions", {"year": year}))
    if sessions.empty:
        sessions.to_parquet(cache_file, index=False)
        return sessions
    meetings = get_meetings(year)[["meeting_key", "meeting_name"]].drop_duplicates()
    sessions = sessions.drop(columns=["meeting_name"], errors="ignore")
    merged = sessions.merge(meetings, on="meeting_key", how="left")
    if merged["meeting_name"].isna().any():
        fallback = "Grand Prix " + merged["location"].fillna("Unknown")
        merged["meeting_name"] = merged["meeting_name"].fillna(fallback)
    merged.to_parquet(cache_file, index=False)
    return merged


def get_meetings(year: int) -> pd.DataFrame:
    """Grands Prix (meeting_key, meeting_name, location...) for a year. Cached."""
    return _cached("meetings", {"year": year}, _cache_path(str(year), "_meetings.parquet"))


def list_gps(year: int) -> list[str]:
    """Sorted meeting names (Grands Prix) for a year."""
    df = list_sessions(year)
    if df.empty or "meeting_name" not in df.columns:
        return []
    return sorted(df["meeting_name"].dropna().unique().tolist())


def list_drivers(session_key: int) -> pd.DataFrame:
    """Drivers for a session (cached per session)."""
    return _cached(
        "drivers", {"session_key": session_key}, _session_cache(session_key, "drivers.parquet")
    )


def list_laps(session_key: int, driver_number: int | None = None) -> pd.DataFrame:
    """Lap rows for a session, optionally one driver (cached per session/driver)."""
    params: dict = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    tag = f"laps_{driver_number}" if driver_number is not None else "laps_all"
    return _cached("laps", params, _session_cache(session_key, f"{tag}.parquet"))


def get_car_data(session_key: int, driver_number: int | None = None) -> pd.DataFrame:
    """3.7Hz telemetry (speed/throttle/brake/gear/DRS). May be EMPTY — never fake it."""
    params: dict = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    tag = f"car_data_{driver_number}" if driver_number is not None else "car_data_all"
    return _cached("car_data", params, _session_cache(session_key, f"{tag}.parquet"))


def get_positions(session_key: int) -> pd.DataFrame:
    """~4s position snapshots for a session."""
    return _cached(
        "position", {"session_key": session_key}, _session_cache(session_key, "position.parquet")
    )


def downsample_by_time(df: pd.DataFrame, hz: float, time_col: str = "t") -> pd.DataFrame:
    """Keep the first row per 1/hz bin of a numeric time column. Pure."""
    if df.empty:
        return df
    step = 1.0 / float(hz)
    bins = (df[time_col].to_numpy(dtype=float) // step).astype("int64")
    keep = pd.Series(bins).drop_duplicates(keep="first").index
    return df.iloc[keep].reset_index(drop=True)


def get_location(session_key: int, driver_number: int) -> pd.DataFrame:
    """Track coordinates (x, y, z) + date for one driver. Cached per driver."""
    tag = f"location_{driver_number}.parquet"
    return _cached(
        "location",
        {"session_key": session_key, "driver_number": driver_number},
        _session_cache(session_key, tag),
    )


# --- M1: picker helpers ---


def list_meetings(year: int) -> pd.DataFrame:
    """One row per Grand Prix meeting: key, name, location, session count."""
    df = list_sessions(year)
    if df.empty:
        return df
    grouped = (
        df.groupby(["meeting_key", "meeting_name"], dropna=False)
        .agg(
            sessions=("session_key", "nunique"),
            location=("location", "first"),
            date_start=("date_start", "min"),
        )
        .reset_index()
        .sort_values("date_start")
    )
    return grouped


def sessions_for_meeting(year: int, meeting_key: int) -> pd.DataFrame:
    """Sessions of one meeting, chronological."""
    df = list_sessions(year)
    if df.empty:
        return df
    return df[df["meeting_key"] == meeting_key].sort_values("date_start")


def session_has_telemetry(session_key: int) -> tuple[bool, str]:
    """Probe whether a session has usable telemetry.

    Returns (True, "") or (False, reason). Probe is one driver's car_data
    (representative sample, cached) — full-grid fetch would be ~20x the bytes.
    """
    drivers = list_drivers(session_key)
    if drivers.empty or "driver_number" not in drivers.columns:
        return False, "no drivers"
    first = int(drivers["driver_number"].iloc[0])
    car = get_car_data(session_key, driver_number=first)
    if car.empty:
        return False, "no telemetry"
    return True, ""


def format_lap_time(seconds: float | None) -> str:
    """Pit-wall format: M:SS.mmm, always 3 decimals; unmeasurable -> em dash."""
    if seconds is None:
        return "—"
    try:
        total = float(seconds)
    except (TypeError, ValueError):
        return "—"
    if total != total:  # NaN check without importing math
        return "—"
    minutes = int(total // 60)
    rest = total - minutes * 60
    return f"{minutes}:{rest:06.3f}"


def clamp_selection(items: list, limit: int = 3) -> list:
    """Keep at most `limit` selections, preserving order (driver picker: max 3)."""
    return list(items)[:limit]


def lap_window(driver_laps: pd.DataFrame, lap_number: int):
    """(window_start, window_end) timestamps for one lap; end None when unknown."""
    laps = driver_laps.dropna(subset=["date_start"]).sort_values("lap_number")
    row = laps[laps["lap_number"] == lap_number]
    if row.empty:
        return None, None
    start = pd.Timestamp(row.iloc[0]["date_start"])
    later = laps[laps["lap_number"] > lap_number]["date_start"].min()
    return start, pd.Timestamp(later) if pd.notna(later) else None


# --- M5: performance feeds ---


def get_stints(session_key: int) -> pd.DataFrame:
    """Tyre stints (compound, lap_start/end, age). Cached per session."""
    return _cached(
        "stints", {"session_key": session_key}, _session_cache(session_key, "stints.parquet")
    )


def get_weather(session_key: int) -> pd.DataFrame:
    """Weather snapshots (air/track temp, rainfall, wind...). Cached per session."""
    return _cached(
        "weather", {"session_key": session_key}, _session_cache(session_key, "weather.parquet")
    )


def get_team_radio(session_key: int) -> pd.DataFrame:
    """Radio events (driver, date, recording_url). No transcripts in the API."""
    return _cached(
        "team_radio",
        {"session_key": session_key},
        _session_cache(session_key, "team_radio.parquet"),
    )


def get_race_control(session_key: int) -> pd.DataFrame:
    """Race-control messages (flags, category, sector). Cached per session."""
    return _cached(
        "race_control",
        {"session_key": session_key},
        _session_cache(session_key, "race_control.parquet"),
    )


def get_session(session_key: int) -> dict:
    """Single session row (start/end, name, meeting) for a session key."""
    cache_file = _session_cache(session_key, "session.parquet")
    if cache_file.exists():
        df = pd.read_parquet(cache_file)
    else:
        df = pd.DataFrame(_fetch("sessions", {"session_key": session_key}))
        df.to_parquet(cache_file, index=False)
    return {} if df.empty else df.iloc[0].to_dict()


def session_window(session_key: int):
    """(start, end) timestamps for a session; raises LookupError if unknown."""
    info = get_session(session_key)
    start, end = info.get("date_start"), info.get("date_end")
    if start is None:
        raise LookupError(f"session {session_key} not found")
    start_ts = pd.Timestamp(str(start))
    end_ts = pd.Timestamp(str(end)) if end is not None else start_ts + pd.Timedelta(hours=3)
    return start_ts, end_ts


def clamp_to_session(
    df: pd.DataFrame, session_key: int, time_col: str = "date"
) -> pd.DataFrame:
    """Drop telemetry rows outside the session window (OpenF1 leaks some)."""
    if df.empty or time_col not in df.columns:
        return df
    start_ts, end_ts = session_window(session_key)
    stamps = to_dt(df[time_col])
    return df[(stamps >= start_ts) & (stamps <= end_ts)]


def build_session_replay(session_key: int, hz: int = 2) -> pd.DataFrame:
    """Per-driver positions for a WHOLE session, cached as parquet.

    Columns: driver_number, t (seconds from session start), x, y.
    Positions only — speed is fetched per driver on demand (/session/speed)
    so the first build is cheap and the payload stays small.
    """
    cache_file = _session_cache(session_key, f"session_pos_{hz}hz.parquet")
    if cache_file.exists():
        return pd.read_parquet(cache_file)
    start_ts, _ = session_window(session_key)
    drivers = list_drivers(session_key)
    frames: list[pd.DataFrame] = []
    for num in [int(n) for n in drivers.get("driver_number", [])]:
        loc = clamp_to_session(get_location(session_key, num), session_key)
        if loc.empty:
            continue
        loc = loc.copy()
        loc["date"] = to_dt(loc["date"])
        loc = loc.sort_values("date").reset_index(drop=True)
        loc["t"] = (loc["date"] - start_ts).dt.total_seconds()
        loc = downsample_by_time(loc, hz, time_col="t")
        frames.append(
            pd.DataFrame(
                {
                    "driver_number": num,
                    "t": loc["t"].round(1),
                    "x": loc["x"].round(1),
                    "y": loc["y"].round(1),
                }
            )
        )
    out = (
        pd.concat(frames, ignore_index=True)
        if frames
        else pd.DataFrame(columns=["driver_number", "t", "x", "y"])
    )
    out.to_parquet(cache_file, index=False)
    return out


def session_speed(session_key: int, driver_number: int, hz: int = 1) -> pd.DataFrame:
    """Whole-session speed for one driver at `hz`, clamped and cached."""
    cache_file = _session_cache(session_key, f"session_speed_{driver_number}_{hz}hz.parquet")
    if cache_file.exists():
        return pd.read_parquet(cache_file)
    start_ts, _ = session_window(session_key)
    car = clamp_to_session(get_car_data(session_key, driver_number), session_key)
    if car.empty:
        out = pd.DataFrame(columns=["t", "v"])
    else:
        car = car.copy()
        car["date"] = to_dt(car["date"])
        car = car.sort_values("date").reset_index(drop=True)
        car["t"] = (car["date"] - start_ts).dt.total_seconds()
        car = downsample_by_time(car, hz, time_col="t")
        out = pd.DataFrame(
            {"t": car["t"].round(1), "v": pd.to_numeric(car["speed"], errors="coerce").round(0)}
        ).dropna(subset=["v"])
    out.to_parquet(cache_file, index=False)
    return out


# --- M3: replay helpers ---


def downsample_5hz(df: pd.DataFrame, time_col: str = "date") -> pd.DataFrame:
    """Thin telemetry to 5 Hz for the map (first row per 200 ms bin). Pure."""
    if df.empty:
        return df
    stamps = to_dt(df[time_col])
    bins = ((stamps - stamps.min()) // pd.Timedelta("200ms")).to_numpy()
    keep = pd.Series(bins).drop_duplicates(keep="first").index
    return df.iloc[keep].reset_index(drop=True)


# --- M2: battle data ---


def get_intervals(session_key: int) -> pd.DataFrame:
    """~4s gap snapshots. Cached per session.

    Lapped cars report gaps like '+1 LAP' — coerced to NaN here so the
    parquet cache stays typed (viz drops NaN gaps already).
    """
    cache_file = _session_cache(session_key, "intervals.parquet")
    if cache_file.exists():
        df = pd.read_parquet(cache_file)
    else:
        df = pd.DataFrame(_fetch("intervals", {"session_key": session_key}))
        for col in ("gap_to_leader", "gap_to_ahead", "interval"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df.to_parquet(cache_file, index=False)
    if "date" in df.columns:
        df = df.copy()
        df["date"] = to_dt(df["date"])
    return df


def team_colors(session_key: int) -> dict[int, str]:
    """driver_number -> '#RRGGBB' team colour (identity on lines/dots/labels only)."""
    drivers = list_drivers(session_key)
    if drivers.empty:
        return {}
    colors = {}
    for r in drivers.itertuples():
        raw = str(getattr(r, "team_colour", "") or "").lstrip("#")
        colors[int(r.driver_number)] = f"#{raw}" if len(raw) == 6 else "#8A94A6"
    return colors


def lap_car_data(session_key: int, driver_number: int, lap_number: int) -> pd.DataFrame:
    """Telemetry rows inside one lap: [lap.date_start, next_lap.date_start).

    OpenF1 car_data carries no lap_number, so the window comes from /laps.
    Empty-safe: missing laps or missing telemetry -> empty DataFrame.
    """
    laps = list_laps(session_key, driver_number=driver_number)
    laps = laps.dropna(subset=["date_start"]).sort_values("lap_number")
    row = laps[laps["lap_number"] == lap_number]
    if row.empty:
        return pd.DataFrame()
    start = pd.Timestamp(row.iloc[0]["date_start"])
    later = laps[laps["lap_number"] > lap_number]["date_start"].min()
    car = get_car_data(session_key, driver_number=driver_number)
    if car.empty:
        return car
    stamps = to_dt(car["date"])
    mask = stamps >= start
    if pd.notna(later):
        mask &= stamps < pd.Timestamp(later)
    return car[mask].reset_index(drop=True)
