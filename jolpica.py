"""Jolpica F1 archive adapter: free, non-commercial, cached, rate-limited.

Jolpica is the maintained successor to Ergast. Its terms allow non-commercial
use under CC BY-NC-SA 4.0 and require a custom User-Agent; burst 4 req/s and
500 req/h. The app is non-commercial and attributes the source in the UI.

No telemetry exists before 2023; this adapter serves results and standings only.
Empty payloads are returned as empty lists so the UI can say "not in the
archive" instead of failing.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from ratelimit import TokenBucket

BASE_URL = os.getenv("JOLPICA_BASE_URL", "https://api.jolpi.ca/ergast/f1").rstrip("/")
USER_AGENT = os.getenv("JOLPICA_USER_AGENT", "BoxBoxReplay/3.6.0")
CACHE_ROOT = Path(os.getenv("CACHE_DIR", "data/cache")) / "jolpica"
CACHE_TTL_S = int(os.getenv("JOLPICA_CACHE_TTL", "3600"))
RATE_PER_SEC = float(os.getenv("JOLPICA_RATE_PER_SEC", "4"))
RATE_PER_MIN = int(os.getenv("JOLPICA_RATE_PER_MIN", "500"))
RATE_PER_HOUR = int(os.getenv("JOLPICA_RATE_PER_HOUR", "500"))
MAX_RETRIES = 3
RETRYABLE = {429, 500, 502, 503, 504}

SOURCE = "Jolpica F1"
LICENSE = "CC BY-NC-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/4.0/"

_limiter = TokenBucket(RATE_PER_SEC, RATE_PER_MIN)
_hour_lock = threading.Lock()
_hour_stamps: deque[float] = deque()
_cache_locks: dict[str, threading.Lock] = {}
_cache_guard = threading.Lock()


class JolpicaUnavailable(RuntimeError):
    """The archive source did not answer; callers should offer a retry."""


def _lock_for(key: str) -> threading.Lock:
    with _cache_guard:
        lock = _cache_locks.get(key)
        if lock is None:
            lock = _cache_locks[key] = threading.Lock()
        return lock


def _throttle() -> None:
    """Enforce both the burst limiter and the 500/hour sustained limit."""
    while True:
        with _hour_lock:
            now = time.monotonic()
            while _hour_stamps and now - _hour_stamps[0] >= 3600:
                _hour_stamps.popleft()
            if len(_hour_stamps) < RATE_PER_HOUR:
                _hour_stamps.append(now)
                break
            wait = _hour_stamps[0] + 3600 - now
        time.sleep(max(0.05, wait))
    _limiter.acquire()


def _cache_file(path: str, params: dict | None) -> Path:
    key = path + "?" + json.dumps(params or {}, sort_keys=True)
    digest = hashlib.sha1(key.encode()).hexdigest()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    return CACHE_ROOT / f"{digest}.json"


def _read_cache(file: Path) -> dict | None:
    try:
        raw = json.loads(file.read_text())
    except (OSError, ValueError):
        return None
    if not isinstance(raw, dict) or "data" not in raw:
        return None
    if CACHE_TTL_S > 0 and time.time() - float(raw.get("fetched_at", 0)) > CACHE_TTL_S:
        return None
    return raw["data"] if isinstance(raw["data"], dict) else None


def _fetch(path: str, params: dict | None = None) -> dict:
    url = f"{BASE_URL}/{path.lstrip('/')}"
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    last_error: Exception | None = None
    with httpx.Client(timeout=30.0, headers=headers) as client:
        for attempt in range(1, MAX_RETRIES + 1):
            _throttle()
            try:
                resp = client.get(url, params=params or {})
                if resp.status_code == 404:
                    return {}
                if resp.status_code in RETRYABLE:
                    last_error = RuntimeError(f"HTTP {resp.status_code}")
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, dict) else {}
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                time.sleep(2**attempt)
    raise JolpicaUnavailable(f"Jolpica did not answer: {url} ({last_error})")


def _get(path: str, params: dict | None = None, *, refresh: bool = False) -> dict:
    """Read-through cache around the archive request; refresh bypasses the TTL."""
    file = _cache_file(path, params)
    if not refresh:
        cached = _read_cache(file)
        if cached is not None:
            return cached
    with _lock_for(str(file)):
        if not refresh:
            cached = _read_cache(file)
            if cached is not None:
                return cached
        data = _fetch(path, params)
        if data:
            try:
                tmp = file.with_suffix(".tmp")
                tmp.write_text(json.dumps({"fetched_at": time.time(), "data": data}))
                tmp.replace(file)
            except OSError:
                pass
        return data


def _mr(data: dict) -> dict:
    return data.get("MRData", {}) if isinstance(data, dict) else {}


def seasons(*, refresh: bool = False) -> list[int]:
    data = _get("seasons.json", {"limit": 100}, refresh=refresh)
    rows = _mr(data).get("SeasonTable", {}).get("Seasons", [])
    return sorted({int(row["season"]) for row in rows if str(row.get("season", "")).isdigit()})


def races(year: int, *, refresh: bool = False) -> list[dict]:
    data = _get(f"{year}/races.json", {"limit": 100}, refresh=refresh)
    rows = _mr(data).get("RaceTable", {}).get("Races", [])
    out = []
    for row in rows:
        circuit = row.get("Circuit", {})
        location = circuit.get("Location", {})
        out.append(
            {
                "round": int(row.get("round", 0)),
                "race_name": row.get("raceName", ""),
                "date": row.get("date"),
                "circuit": circuit.get("circuitName", ""),
                "locality": location.get("locality", ""),
                "country": location.get("country", ""),
            }
        )
    return sorted(out, key=lambda r: r["round"])


def _standings_rows(
    year: int, round: int | None, kind: str, *, refresh: bool = False
) -> list[dict]:
    suffix = f"/{round}" if round else ""
    data = _get(f"{year}{suffix}/{kind}.json", {"limit": 100}, refresh=refresh)
    lists = _mr(data).get("StandingsTable", {}).get("StandingsLists", [])
    if not lists:
        return []
    key = "DriverStandings" if kind == "driverstandings" else "ConstructorStandings"
    rows = lists[0].get(key, [])
    if kind == "driverstandings":
        out = []
        for row in rows:
            driver = row.get("Driver", {})
            name = f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip()
            teams = ", ".join(c.get("name", "") for c in row.get("Constructors", []))
            out.append(
                {
                    "position": int(row.get("position", 0)),
                    "points": float(row.get("points", 0)),
                    "wins": int(row.get("wins", 0)),
                    "driver_id": driver.get("driverId", ""),
                    "code": driver.get("code", ""),
                    "name": name,
                    "number": driver.get("permanentNumber"),
                    "constructor": teams,
                }
            )
        return out
    return [
        {
            "position": int(row.get("position", 0)),
            "points": float(row.get("points", 0)),
            "wins": int(row.get("wins", 0)),
            "constructor_id": row.get("Constructor", {}).get("constructorId", ""),
            "name": row.get("Constructor", {}).get("name", ""),
        }
        for row in rows
    ]


def standings(year: int, round: int | None = None, *, refresh: bool = False) -> dict:
    drivers = _standings_rows(year, round, "driverstandings", refresh=refresh)
    constructors = _standings_rows(year, round, "constructorstandings", refresh=refresh)
    return {
        "year": year,
        "round": round,
        "drivers": drivers,
        "constructors": constructors,
        "source": SOURCE,
        "license": LICENSE,
        "license_url": LICENSE_URL,
    }


def results(year: int, round: int, *, refresh: bool = False) -> dict:
    data = _get(f"{year}/{round}/results.json", {"limit": 100}, refresh=refresh)
    race_rows = _mr(data).get("RaceTable", {}).get("Races", [])
    if not race_rows:
        return {
            "year": year,
            "round": round,
            "race": None,
            "results": [],
            "source": SOURCE,
            "license": LICENSE,
        }
    race = race_rows[0]
    rows = []
    for row in race.get("Results", []):
        driver = row.get("Driver", {})
        constructor = row.get("Constructor", {})
        time_info = row.get("Time", {})
        fastest = row.get("FastestLap", {})
        rows.append(
            {
                "position": int(row.get("position", 0)),
                "position_text": row.get("positionText", ""),
                "points": float(row.get("points", 0)),
                "driver_id": driver.get("driverId", ""),
                "code": driver.get("code", ""),
                "name": f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip(),
                "team": constructor.get("name", ""),
                "grid": int(row.get("grid", 0)),
                "laps": int(row.get("laps", 0)),
                "status": row.get("status", ""),
                "time": time_info.get("time"),
                "fastest_lap": fastest.get("Time", {}).get("time"),
            }
        )
    circuit = race.get("Circuit", {})
    location = circuit.get("Location", {})
    return {
        "year": year,
        "round": round,
        "race": {
            "round": int(race.get("round", round)),
            "race_name": race.get("raceName", ""),
            "date": race.get("date"),
            "circuit": circuit.get("circuitName", ""),
            "locality": location.get("locality", ""),
            "country": location.get("country", ""),
        },
        "results": rows,
        "source": SOURCE,
        "license": LICENSE,
    }


def progression(year: int, through_round: int, *, refresh: bool = False) -> dict:
    """Points after each round, for the season chart. One cached request/round."""
    if through_round < 1:
        return {
            "year": year,
            "rounds": [],
            "series": [],
            "source": SOURCE,
            "license": LICENSE,
            "license_url": LICENSE_URL,
        }
    rounds: list[int] = []
    by_driver: dict[str, dict] = {}
    points_by_round: dict[str, dict[int, float]] = {}
    # Four workers overlap network latency; the shared limiter still enforces 4/s.
    with ThreadPoolExecutor(max_workers=4) as pool:
        fetched = list(
            pool.map(
                lambda rnd: (rnd, _standings_rows(year, rnd, "driverstandings", refresh=refresh)),
                range(1, through_round + 1),
            )
        )
    for rnd, rows in fetched:
        if not rows:
            continue
        rounds.append(rnd)
        for row in rows:
            entry = by_driver.setdefault(
                row["driver_id"],
                {
                    "driver_id": row["driver_id"],
                    "code": row["code"] or row["name"][:3].upper(),
                    "name": row["name"],
                    "constructor": row["constructor"],
                },
            )
            points_by_round.setdefault(entry["driver_id"], {})[rnd] = row["points"]
    series = []
    for entry in by_driver.values():
        by_round = points_by_round.get(entry["driver_id"], {})
        # A driver who did not appear in a round keeps the points they already
        # had; only a driver's first appearance starts from zero.
        carried = 0.0
        points: list[float] = []
        for rnd in rounds:
            if rnd in by_round:
                carried = by_round[rnd]
            points.append(carried)
        entry["points"] = points
        series.append(entry)
    series.sort(key=lambda e: e["points"][-1] if e["points"] else 0, reverse=True)
    calendar = {race["round"]: race for race in races(year, refresh=refresh)}
    race_meta = [
        {
            "round": rnd,
            "race_name": calendar.get(rnd, {}).get("race_name", f"Round {rnd}"),
            "date": calendar.get(rnd, {}).get("date"),
        }
        for rnd in rounds
    ]
    return {
        "year": year,
        "rounds": rounds,
        "races": race_meta,
        "series": series,
        "source": SOURCE,
        "license": LICENSE,
        "license_url": LICENSE_URL,
    }
