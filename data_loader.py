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
    """GET BASE_URL/endpoint with throttle + retry. Returns parsed JSON list."""
    url = f"{BASE_URL}/{endpoint.lstrip('/')}"
    last_error: Exception | None = None
    with httpx.Client(timeout=30.0, headers={"User-Agent": "boxbox-replay-m0"}) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            _throttle()
            try:
                resp = client.get(url, params=params or {})
                if resp.status_code in RETRYABLE_STATUS:
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, list) else []
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                time.sleep(2**attempt)
    raise RuntimeError(f"OpenF1 fetch failed after {MAX_RETRIES} tries: {url} ({last_error})")


def _slug(text: str) -> str:
    """Filesystem-safe slug for cache path parts."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in text).strip("_") or "unknown"


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
    """All sessions for a year (cached at data/cache/<year>/_sessions.parquet)."""
    return _cached("sessions", {"year": year}, _cache_path(str(year), "_sessions.parquet"))


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


# --- M3: replay helpers ---


def downsample_5hz(df: pd.DataFrame, time_col: str = "date") -> pd.DataFrame:
    """Thin telemetry to 5 Hz for the map (first row per 200 ms bin). Pure."""
    if df.empty:
        return df
    stamps = pd.to_datetime(df[time_col], utc=True)
    bins = ((stamps - stamps.min()) // pd.Timedelta("200ms")).to_numpy()
    keep = pd.Series(bins).drop_duplicates(keep="first").index
    return df.loc[keep].reset_index(drop=True)


# --- M2: battle data ---


def get_intervals(session_key: int) -> pd.DataFrame:
    """~4s gap snapshots (gap_to_leader). Cached per session."""
    return _cached(
        "intervals", {"session_key": session_key}, _session_cache(session_key, "intervals.parquet")
    )


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
    stamps = pd.to_datetime(car["date"], utc=True)
    mask = stamps >= start
    if pd.notna(later):
        mask &= stamps < pd.Timestamp(later)
    return car[mask].reset_index(drop=True)
