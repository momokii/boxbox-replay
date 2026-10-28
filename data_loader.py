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
