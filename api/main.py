"""BoxBox Replay API (R0): thin FastAPI wrap over data_loader/analysis/coach.

All domain logic lives in the tested modules; endpoints serialize to JSON.
Empty datasets serialize as [] (the UI renders empty states, never crashes).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import ai
import analysis
import coach
import data_loader

app = FastAPI(title="BoxBox Replay API")


@app.exception_handler(data_loader.FeedAuthRequired)
def _feed_auth_required(_request: Request, exc: data_loader.FeedAuthRequired) -> JSONResponse:
    """The upstream feed wants credentials: say so plainly, never a bare 500."""
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The OpenF1 feed now requires credentials. Set OPENF1_API_KEY "
            "in .env and restart; already-cached sessions keep working.",
            "reason": str(exc),
        },
    )


def records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> JSON-safe records (NaN -> None, timestamps -> ISO str).

    Also normalizes numpy scalars and array cells (segment traces arrive
    as ndarrays), which FastAPI's encoder would otherwise reject.
    """
    if df.empty:
        return []
    out = df.astype(object).mask(df.isna(), None)
    for col in out.columns:
        if out[col].dtype == object:
            out[col] = pd.Series(
                [_jsonable(v) for v in out[col].tolist()], dtype=object, index=out.index
            )
        if pd.api.types.is_datetime64_any_dtype(out[col]) or (
            len(out) and isinstance(out[col].iloc[0], pd.Timestamp)
        ):
            out[col] = pd.Series(
                [None if v is None else str(v) for v in out[col].tolist()],
                dtype=object,
                index=out.index,
            )
    return out.to_dict(orient="records")


def _jsonable(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, np.ndarray):
        return [_jsonable(x) for x in v.tolist()]
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return str(v)
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.get("/years")
def years() -> list[int]:
    return data_loader.list_years()


@app.get("/meetings")
def meetings(year: int):
    return records(data_loader.list_meetings(year))


@app.get("/sessions")
def sessions(year: int, meeting_key: int):
    return records(data_loader.sessions_for_meeting(year, meeting_key))


@app.get("/sessions/status")
def session_status(keys: str) -> dict[str, str]:
    """Telemetry probe per session key (comma-separated): key -> '' or reason."""
    out: dict[str, str] = {}
    for raw in keys.split(","):
        raw = raw.strip()
        if raw.isdigit():
            out[raw] = data_loader.session_has_telemetry(int(raw))[1]
    return out


@app.get("/drivers")
def drivers(session_key: int):
    return records(data_loader.list_drivers(session_key))


@app.get("/laps")
def laps(session_key: int, driver_number: int | None = None):
    return records(data_loader.list_laps(session_key, driver_number))


@app.get("/lap-window")
def lap_window(session_key: int, driver_number: int, lap: int) -> dict:
    df = data_loader.list_laps(session_key, driver_number=driver_number)
    start, end = data_loader.lap_window(df, lap)
    if start is None:
        raise HTTPException(404, "lap not found")
    return {"start": str(start), "end": str(end) if end is not None else None}


def _windowed(
    session_key: int,
    driver_number: int,
    lap: int | None,
    fetch,
    start: str | None = None,
    end: str | None = None,
):
    if start and end:
        win_start, win_end = pd.Timestamp(start), pd.Timestamp(end)
    else:
        if lap is None:
            raise HTTPException(400, "lap or start/end required")
        laps_df = data_loader.list_laps(session_key, driver_number=driver_number)
        win_start, win_end = data_loader.lap_window(laps_df, lap)
        if win_start is None:
            raise HTTPException(404, "lap not found")
        if win_end is None:
            win_end = win_start + pd.Timedelta(seconds=150)
    df = fetch(session_key, driver_number)
    if df.empty or "date" not in df.columns:
        return []
    stamps = data_loader.to_dt(df["date"])
    win = df[(stamps >= win_start) & (stamps < win_end)].copy()
    win["date"] = data_loader.to_dt(win["date"]).astype(str)
    return win


@app.get("/car")
def car(
    session_key: int,
    driver_number: int,
    lap: int | None = None,
    start: str | None = None,
    end: str | None = None,
):
    win = _windowed(session_key, driver_number, lap, data_loader.get_car_data, start, end)
    if isinstance(win, list):
        return win
    t0 = data_loader.to_dt(win["date"]).min()
    win = win.copy()
    win["t"] = (data_loader.to_dt(win["date"]) - t0).dt.total_seconds()
    cols = ["t", "date", "speed", "n_gear", "throttle", "brake", "drs"]
    return records(win[[c for c in cols if c in win.columns]])


@app.get("/location")
def location(
    session_key: int,
    driver_number: int,
    lap: int | None = None,
    hz: int = 5,
    start: str | None = None,
    end: str | None = None,
):
    win = _windowed(session_key, driver_number, lap, data_loader.get_location, start, end)
    if isinstance(win, list):
        return win
    t0 = data_loader.to_dt(win["date"]).min()
    win = win.copy()
    win["t"] = (data_loader.to_dt(win["date"]) - t0).dt.total_seconds()
    thin = data_loader.downsample_5hz(win) if hz == 5 else win
    cols = ["t", "date", "x", "y", "z"]
    return records(thin[[c for c in cols if c in thin.columns]])


@app.get("/geometry")
def geometry(session_key: int, driver_number: int, lap: int) -> dict:
    loc = data_loader.get_location(session_key, driver_number)
    if loc.empty:
        raise HTTPException(404, "no location data")
    ax, ay = analysis.map_plane(loc)
    laps_df = data_loader.list_laps(session_key, driver_number=driver_number)
    start, end = data_loader.lap_window(laps_df, lap)
    if start is None:
        raise HTTPException(404, "lap not found")
    end_ts = end if end is not None else start + pd.Timedelta(seconds=150)
    stamps = data_loader.to_dt(loc["date"])
    trace = loc[(stamps >= start) & (stamps < end_ts)].reset_index(drop=True)
    path = analysis.resample_path(analysis.clean_track_points(trace, ax, ay), ax, ay)
    line = pd.DataFrame({"x": path["x"].to_numpy(), "y": path["y"].to_numpy()})
    corners = analysis.detect_corners(path)
    merged = _lap_merged_car_loc(session_key, driver_number, start, end_ts)
    zones = analysis.drs_zones(merged, ax, ay) if not merged.empty else pd.DataFrame()
    return {
        "ax": ax,
        "ay": ay,
        "outline": line.values.tolist(),
        "corners": records(corners.rename(columns={"x": "x", "y": "y"})),
        "zones": zones.to_dict(orient="records") if not zones.empty else [],
    }


def _trace_rows(trace: pd.DataFrame) -> list[list[float]]:
    """Trace rows as [progress, x, y, seconds] with stable decimal places."""
    return [
        [round(float(r.f), 4), round(float(r.x), 1), round(float(r.y), 1), round(float(r.t), 3)]
        for r in trace.itertuples()
    ]


@app.get("/session/inputs")
def session_inputs(
    session_key: int,
    driver_number: int,
    t0: float,
    t1: float,
) -> dict:
    """One driver's inputs over a session-time window (seconds on the replay clock).

    Several drivers can share the same window, which is what the comparison
    strip needs. Missing channels come back as nulls, never as guesses.
    """
    if t1 <= t0:
        raise HTTPException(422, "t1 must be after t0")
    clock_start, _end, markers, _dur = _session_clock(session_key)
    base = float(markers["t"].min()) if not markers.empty else 0.0
    win_start = clock_start + pd.Timedelta(seconds=base + t0)
    win_end = clock_start + pd.Timedelta(seconds=base + t1)

    car = data_loader.get_car_data(session_key, driver_number=driver_number)
    if car.empty or "date" not in car.columns:
        raise HTTPException(404, "no car data for this driver")
    stamps = data_loader.to_dt(car["date"])
    win = car[(stamps >= win_start) & (stamps < win_end)].sort_values("date")
    if win.empty:
        raise HTTPException(404, "no car data in this window")

    t = (data_loader.to_dt(win["date"]) - win_start).dt.total_seconds()

    def channel(name: str) -> list:
        if name not in win.columns:
            return []
        values = []
        for value in win[name].tolist():
            values.append(None if pd.isna(value) else round(float(value), 3))
        return values

    return {
        "driver_number": driver_number,
        "lap": None,
        "lap_duration": t1 - t0,
        "window_t0": t0,
        "t": [round(float(v), 3) for v in t],
        "speed": channel("speed"),
        "throttle": channel("throttle"),
        "brake": channel("brake"),
        "gear": channel("n_gear"),
        "drs": channel("drs"),
    }


@app.get("/session/duel")
def session_duel(
    session_key: int, a_driver: int, a_lap: int, b_driver: int, b_lap: int
) -> dict:
    """Two laps aligned by distance, plus the time delta at equal progress.

    Both traces share one 600-point grid, so the client can interpolate both
    cars by progress and never has to align anything itself.
    """
    sides: dict[str, dict] = {}
    for label, driver, lap in (("a", a_driver, a_lap), ("b", b_driver, b_lap)):
        laps_df = data_loader.list_laps(session_key, driver_number=driver)
        start, end = data_loader.lap_window(laps_df, lap)
        if start is None:
            raise HTTPException(404, f"lap {lap} not found for driver {driver}")
        row = laps_df[laps_df.get("lap_number") == lap].tail(1)
        duration = None
        if not row.empty and "lap_duration" in row.columns:
            value = row["lap_duration"].iloc[0]
            if pd.notna(value):
                duration = float(value)
        end_ts = end if end is not None else start + pd.Timedelta(seconds=duration or 150)
        loc = data_loader.get_location(session_key, driver)
        trace = analysis.lap_progress(loc, start, end_ts, duration=duration)
        if trace.empty:
            raise HTTPException(404, f"no position data for driver {driver} lap {lap}")
        sides[label] = {
            "driver_number": driver,
            "lap": lap,
            "lap_duration": duration,
            "trace": trace,
        }

    a, b = sides["a"]["trace"], sides["b"]["trace"]
    delta = analysis.duel_delta(a, b)
    points = len(a)
    return {
        "points": points,
        "a": {k: v for k, v in sides["a"].items() if k != "trace"},
        "b": {k: v for k, v in sides["b"].items() if k != "trace"},
        "traces": {"a": _trace_rows(a), "b": _trace_rows(b)},
        "delta": [[round(float(r.f), 4), round(float(r.dt), 3)] for r in delta.itertuples()],
    }


def _lap_merged_car_loc(session_key: int, driver_number: int, start, end_ts) -> pd.DataFrame:
    car = data_loader.get_car_data(session_key, driver_number=driver_number)
    loc = data_loader.get_location(session_key, driver_number=driver_number)
    if car.empty or loc.empty or "drs" not in car.columns:
        return pd.DataFrame()
    car_s = car.sort_values("date").reset_index(drop=True)
    loc_s = loc.sort_values("date").reset_index(drop=True)
    car_s["date"] = data_loader.to_dt(car_s["date"])
    loc_s["date"] = data_loader.to_dt(loc_s["date"])
    window = car_s[(car_s["date"] >= start) & (car_s["date"] < end_ts)]
    return pd.merge_asof(
        window, loc_s, on="date", direction="nearest", tolerance=pd.Timedelta("500ms")
    )


@app.get("/intervals")
def intervals(session_key: int):
    return records(data_loader.get_intervals(session_key))


@app.get("/stints")
def stints(session_key: int):
    return records(data_loader.get_stints(session_key))


def _session_clock(session_key: int):
    """(start, end, markers, duration_s) — the single source of replay time.

    Lap starts outside the session window are ignored (some feeds carry them),
    markers are zeroed at lights out, and the race duration can never exceed
    the scheduled session window.
    """
    start, end = data_loader.session_window(session_key)
    laps = data_loader.list_laps(session_key)
    if not laps.empty:
        stamps = data_loader.to_dt(laps["date_start"])
        laps = laps[(stamps >= start) & (stamps <= end)]
    markers = analysis.lap_markers(laps, start)
    window_s = (end - start).total_seconds()
    if markers.empty:
        return start, end, markers, window_s
    t0 = float(markers["t"].min())
    markers = markers.assign(t=(markers["t"] - t0).round(1))
    markers = markers[markers["t"] >= 0].reset_index(drop=True)
    timed = laps.dropna(subset=["lap_duration"]) if not laps.empty else laps
    tail = 90.0
    if not timed.empty:
        tail = float(pd.to_numeric(timed["lap_duration"], errors="coerce").median())
    duration = min(window_s, float(markers["t"].max()) + tail)
    return start, end, markers, duration


def _with_session_time(df: pd.DataFrame, session_key: int) -> pd.DataFrame:
    """Attach t (seconds from lights out) to event rows; drop pre-session rows."""
    if df.empty or "date" not in df.columns:
        return df
    start, _ = data_loader.session_window(session_key)
    laps = data_loader.list_laps(session_key)
    markers = analysis.lap_markers(laps, start)
    t0 = float(markers["t"].min()) if not markers.empty else 0.0
    stamps = data_loader.to_dt(df["date"])
    out = df.assign(t=(stamps - start).dt.total_seconds() - t0).round({"t": 1})
    return out[out["t"] >= 0].sort_values("t").reset_index(drop=True)


@app.get("/radio")
def radio(session_key: int):
    """All team-radio events for the session (audio only; the API has no text)."""
    return records(_with_session_time(data_loader.get_team_radio(session_key), session_key))


@app.get("/race-control")
def race_control(session_key: int):
    """All race-control messages for the session, chronological."""
    return records(_with_session_time(data_loader.get_race_control(session_key), session_key))


@app.get("/weather")
def weather(session_key: int):
    """Full weather series (not just the latest sample)."""
    df = _with_session_time(data_loader.get_weather(session_key), session_key)
    cols = ["t", "air_temperature", "track_temperature", "humidity", "rainfall", "wind_speed"]
    return records(df[[c for c in cols if c in df.columns]])


@app.get("/session/pit")
def session_pit(session_key: int) -> dict:
    """Pit stops with measured durations, plus a per-driver summary."""
    raw = data_loader.get_pit(session_key)
    timed = _with_session_time(raw, session_key) if not raw.empty else raw
    summary = analysis.pit_summary(raw)
    stop_cols = [
        c
        for c in ("driver_number", "t", "lap_number", "stop_duration", "pit_duration")
        if c in timed.columns
    ]
    return {
        "summary": records(summary),
        "stops": records(timed[stop_cols]) if not timed.empty and stop_cols else [],
    }


@app.get("/session/positions")
def session_positions(session_key: int) -> list[dict]:
    """Official classification over time, zeroed at lights out."""
    raw = data_loader.get_position(session_key)
    if raw.empty:
        return []
    timed = _with_session_time(raw, session_key)
    cols = [c for c in ("driver_number", "t", "position") if c in timed.columns]
    return records(timed[cols]) if cols else []


@app.get("/session/overtakes")
def session_overtakes(session_key: int) -> dict:
    """On-track overtakes with times, plus made/lost totals per driver."""
    raw = data_loader.get_overtakes(session_key)
    if raw.empty:
        return {"counts": [], "events": []}
    timed = _with_session_time(raw, session_key)
    events = records(
        timed[
            [
                c
                for c in (
                    "t",
                    "overtaking_driver_number",
                    "overtaken_driver_number",
                    "position",
                )
                if c in timed.columns
            ]
        ]
    )
    return {"counts": records(analysis.overtake_counts(raw)), "events": events}


@app.get("/session/result")
def session_result(session_key: int) -> list[dict]:
    """Final classification (position, points, DNF) for the session."""
    raw = data_loader.get_session_result(session_key)
    return records(raw)


@app.get("/session/info")
def session_info(session_key: int) -> dict:
    """Session clock + race distance: the numbers the UI should show."""
    start, end, _markers, race_duration = _session_clock(session_key)
    info = data_loader.get_session(session_key)
    laps = data_loader.list_laps(session_key)
    total = pd.to_numeric(laps["lap_number"], errors="coerce").max() if not laps.empty else 0
    # Driver count comes from the entry list, not from who completed a lap:
    # a cancelled or partially covered session still has entries.
    entrants = data_loader.list_drivers(session_key)
    return {
        "session_key": session_key,
        "session_name": info.get("session_name"),
        "date_start": str(start),
        "date_end": str(end),
        "duration_s": round(race_duration, 1),
        "total_laps": 0 if pd.isna(total) else int(total),
        "drivers": 0 if entrants.empty else int(entrants["driver_number"].nunique()),
    }


@app.get("/session/geometry")
def session_geometry(session_key: int, driver_number: int | None = None) -> dict:
    """Track outline + corners + DRS zones derived from one fast lap."""
    laps = data_loader.list_laps(session_key)
    if laps.empty:
        raise HTTPException(404, "no laps")
    timed = laps.dropna(subset=["lap_duration"])
    if timed.empty:
        raise HTTPException(404, "no timed laps")
    # Some feeds only cover part of the session, so the fastest lap may have no
    # positions at all. Cover the candidates with actual location data, then
    # pick the fastest of those.
    coverage: dict[int, tuple[pd.Timestamp, pd.Timestamp]] = {}
    for num in sorted(timed["driver_number"].unique()):
        loc_n = data_loader.get_location(session_key, int(num))
        if loc_n.empty:
            continue
        stamps_n = data_loader.to_dt(loc_n["date"])
        moving = loc_n[(loc_n["x"] != 0) | (loc_n["y"] != 0)]
        if moving.empty:
            continue
        moving_stamps = data_loader.to_dt(moving["date"])
        coverage[int(num)] = (moving_stamps.min(), moving_stamps.max())
        del stamps_n
    if not coverage:
        raise HTTPException(404, "no position data in this feed")

    chosen = None
    for row in timed.sort_values("lap_duration").itertuples():
        drv_c, lap_c = int(row.driver_number), int(row.lap_number)
        if drv_c not in coverage:
            continue
        st_c, en_c = data_loader.lap_window(
            data_loader.list_laps(session_key, driver_number=drv_c), lap_c
        )
        if st_c is None:
            continue
        end_c = en_c if en_c is not None else st_c + pd.Timedelta(seconds=150)
        c_min, c_max = coverage[drv_c]
        if end_c < c_min or st_c > c_max:
            continue
        chosen = (drv_c, lap_c)
        break
    if chosen is None:
        raise HTTPException(404, "no lap has position data in this feed")
    drv, lap = chosen
    loc = data_loader.get_location(session_key, drv)
    if loc.empty:
        raise HTTPException(404, "no location data")
    ax, ay = analysis.map_plane(loc)
    laps_df = data_loader.list_laps(session_key, driver_number=drv)
    start, end = data_loader.lap_window(laps_df, lap)
    if start is None:
        raise HTTPException(404, "lap not found")
    end_ts = end if end is not None else start + pd.Timedelta(seconds=150)
    stamps = data_loader.to_dt(loc["date"])
    trace = loc[(stamps >= start) & (stamps < end_ts)].reset_index(drop=True)
    path = analysis.resample_path(analysis.clean_track_points(trace, ax, ay), ax, ay)
    angle = analysis.start_angle(path)
    rotated = analysis.rotate_path(path, -angle)
    line = pd.DataFrame({"x": rotated["x"].to_numpy(), "y": rotated["y"].to_numpy()})
    corners = analysis.detect_corners(path)
    merged = _lap_merged_car_loc(session_key, drv, start, end_ts)
    zones_df = analysis.drs_zones(merged, ax, ay) if not merged.empty else pd.DataFrame()
    zones = (
        analysis.rotate_points(
            [
                {
                    "x0": float(z.x0),
                    "y0": float(z.y0),
                    "x1": float(z.x1),
                    "y1": float(z.y1),
                    "label": z.label,
                }
                for z in zones_df.itertuples()
            ],
            -angle,
        )
        if not zones_df.empty
        else []
    )
    return {
        "ax": ax,
        "ay": ay,
        "angle": angle,
        "driver": drv,
        "lap": lap,
        "outline": line.values.tolist(),
        "corners": analysis.rotate_points(records(corners), -angle),
        "zones": zones,
    }


@app.get("/session/replay")
def session_replay(session_key: int, hz: int | None = None, refresh: bool = False) -> dict:
    """Whole-session positions for every driver, zeroed at lights-out.

    t = 0 is the leader's first lap (not the session window start, which
    includes pre-race). Everything else in the UI uses the same origin.
    """
    start, end, markers, _ = _session_clock(session_key)
    duration = (end - start).total_seconds()
    rate = hz or (2 if duration <= 1800 else 1)
    if refresh:
        for hz_name in {rate, 1, 2}:
            cache = data_loader._session_cache(session_key, f"session_pos_v2_{hz_name}hz.parquet")
            cache.unlink(missing_ok=True)
    df = data_loader.build_session_replay(session_key, hz=rate)
    if df.empty:
        raise HTTPException(404, "no telemetry for this session")
    t0 = float(markers["t"].min()) if not markers.empty else 0.0
    drivers = []
    max_t = 0.0
    for num, group in df.sort_values("t").groupby("driver_number"):
        g = group.dropna(subset=["x", "y"]).copy()
        g["t"] = (g["t"] - t0).round(1)
        g = g[g["t"] >= 0]
        if g.empty:
            continue
        max_t = max(max_t, float(g["t"].max()))
        drivers.append(
            {
                "driver_number": int(num),
                "t": g["t"].tolist(),
                "x": g["x"].tolist(),
                "y": g["y"].tolist(),
            }
        )
    # Race length comes from the lap clock, never from position coverage.
    race_duration = _session_clock(session_key)[3]
    expected = len(data_loader.list_drivers(session_key))
    return {
        "start": str(start),
        "end": str(end),
        "duration_s": round(race_duration, 1),
        "hz": rate,
        "laps": markers.to_dict(orient="records"),
        "drivers": drivers,
        "drivers_included": len(drivers),
        "drivers_expected": expected,
        "positions_end_s": round(max_t, 1),
    }


@app.get("/session/speed")
def session_speed(session_key: int, driver_number: int, hz: int = 1) -> list[dict]:
    """Whole-session speed for one driver, zeroed at lights-out."""
    start, _end, markers, _dur = _session_clock(session_key)
    t0 = float(markers["t"].min()) if not markers.empty else 0.0
    df = data_loader.session_speed(session_key, driver_number, hz=hz)
    if df.empty:
        return []
    df = df.assign(t=(df["t"] - t0).round(1))
    return records(df[df["t"] >= 0])


@app.get("/session/gaps")
def session_gaps(session_key: int) -> dict:
    """Gaps for the tower: live intervals when available, else lap-derived.

    Times are zeroed at lights-out, matching /session/replay.
    """
    start, _end, markers, _dur = _session_clock(session_key)
    laps = data_loader.list_laps(session_key)
    t0 = float(markers["t"].min()) if not markers.empty else 0.0
    df = data_loader.get_intervals(session_key)
    if not df.empty and "gap_to_leader" in df.columns and df["gap_to_leader"].notna().any():
        stamps = data_loader.to_dt(df["date"])
        keep = df.assign(t=(stamps - start).dt.total_seconds() - t0)
        keep = keep[keep["t"] >= 0][["driver_number", "t", "gap_to_leader"]].dropna(
            subset=["gap_to_leader"]
        )
        return {"source": "intervals", "points": records(keep.round(3))}
    derived = analysis.derive_gaps(laps)
    if derived.empty:
        return {"source": "none", "points": []}
    t_by_lap = dict(zip(markers["lap_number"].tolist(), markers["t"].tolist(), strict=False))
    derived = derived.assign(t=derived["lap_number"].map(t_by_lap)).dropna(subset=["t"])
    points = derived[["driver_number", "t", "gap_s"]].rename(columns={"gap_s": "gap_to_leader"})
    return {"source": "lap_times", "points": records(points.round(3))}


class LapRef(BaseModel):
    driver: int
    lap: int


class CornerLossRequest(BaseModel):
    session_key: int
    ref: LapRef
    chal: LapRef
    corner: str


@app.post("/corner-loss")
def corner_loss(req: CornerLossRequest):
    ref_laps = data_loader.list_laps(req.session_key, driver_number=req.ref.driver)
    chal_laps = data_loader.list_laps(req.session_key, driver_number=req.chal.driver)
    r_start, r_end = data_loader.lap_window(ref_laps, req.ref.lap)
    c_start, c_end = data_loader.lap_window(chal_laps, req.chal.lap)
    if r_start is None or c_start is None:
        raise HTTPException(404, "lap not found")
    r_end_ts = r_end if r_end is not None else r_start + pd.Timedelta(seconds=150)
    c_end_ts = c_end if c_end is not None else c_start + pd.Timedelta(seconds=150)
    loc = data_loader.get_location(req.session_key, req.ref.driver)
    if loc.empty:
        raise HTTPException(404, "no location data")
    ax, ay = analysis.map_plane(loc)
    ref_trace = _slice_loc(req.session_key, req.ref.driver, r_start, r_end_ts)
    path = analysis.resample_path(analysis.clean_track_points(ref_trace, ax, ay), ax, ay)
    corners = analysis.detect_corners(path)
    if corners.empty or req.corner not in corners["label"].tolist():
        raise HTTPException(404, "corner not found")
    c_trace = _slice_loc(req.session_key, req.chal.driver, c_start, c_end_ts)
    out = analysis.corner_losses(path, corners, c_trace, ref_trace, ax, ay)
    row = out[out["label"] == req.corner]
    if row.empty:
        raise HTTPException(404, "no overlapping telemetry")
    loss = row.iloc[0]["loss_s"]
    return {
        "corner": req.corner,
        "loss_s": None if loss is None or pd.isna(loss) else float(loss),
        "flagged": bool(row.iloc[0]["flagged"]),
        "confidence": coach.confidence_for(None if loss is None or pd.isna(loss) else float(loss)),
    }


def _slice_loc(session_key: int, driver: int, start, end_ts) -> pd.DataFrame:
    loc = data_loader.get_location(session_key, driver)
    if loc.empty:
        return loc
    stamps = data_loader.to_dt(loc["date"])
    return loc[(stamps >= start) & (stamps < end_ts)].reset_index(drop=True)


class CoachRequest(BaseModel):
    driver: str
    lap: int
    ref_driver: str
    ref_lap: int
    corner: str
    loss_s: float | None = None
    lap_delta_s: float | None = None
    session_key: int | None = None


class PitCallRequest(BaseModel):
    base_pace_s: float
    fresh_pace_s: float
    deg_slope_s_per_lap: float = 0.0
    laps_remaining: int = 10
    pit_loss_s: float = 22.0
    gap_behind_s: float | None = None


@app.post("/pit-call")
def pit_call(req: PitCallRequest) -> dict:
    return analysis.pit_toy_model(
        req.base_pace_s,
        req.fresh_pace_s,
        req.deg_slope_s_per_lap,
        req.laps_remaining,
        req.pit_loss_s,
        req.gap_behind_s,
    )


@app.post("/coach/ask")
def coach_ask(req: CoachRequest) -> dict:
    prompt = coach.build_prompt(
        req.driver, req.lap, req.ref_driver, req.ref_lap, req.corner, req.loss_s, req.lap_delta_s
    )
    conf = coach.confidence_for(req.loss_s)
    basis = f"based on lap {req.lap} vs ref {req.ref_lap}"
    answer: str | None = None
    if ai.configured() and req.session_key:
        try:
            facts, _ = _ai_facts(req.session_key)
            answer = ai.answer_corner(req.session_key, facts, prompt) or None
        except (ai.AINotConfigured, ai.AIError):
            answer = None
    llm = answer is not None
    if not answer:
        answer = coach.fallback_answer(req.corner, req.loss_s, req.ref_driver, req.ref_lap)
    return {"answer": answer, "confidence": conf, "basis": basis, "llm": llm}


# ── AI coach (OpenCode Go) ──────────────────────────────────────────────────

def _driver_meta(session_key: int) -> dict[int, dict[str, str]]:
    drivers = data_loader.list_drivers(session_key)
    if drivers.empty or "name_acronym" not in drivers.columns:
        return {}
    meta: dict[int, dict[str, str]] = {}
    for row in drivers.itertuples():
        if pd.isna(row.name_acronym):
            continue
        meta[int(row.driver_number)] = {
            "code": str(row.name_acronym),
            "name": str(getattr(row, "full_name", "") or row.name_acronym),
            "team": str(getattr(row, "team_name", "") or ""),
        }
    return meta


def _ai_facts(session_key: int) -> tuple[str, list[str]]:
    """Compact, measured facts for the model. Missing sections are omitted."""
    meta = _driver_meta(session_key)

    def code(number: object) -> str:
        try:
            return meta.get(int(number), {}).get("code", f"#{int(number)}")
        except (TypeError, ValueError):
            return "?"

    def name(number: object) -> str:
        try:
            return meta.get(int(number), {}).get("name", f"#{int(number)}")
        except (TypeError, ValueError):
            return "?"

    lines: list[str] = []
    used: list[str] = []

    info = session_info(session_key)
    session_name = str(info.get("session_name") or "")
    lowered = session_name.lower()
    is_race = "race" in lowered or lowered == "sprint"
    is_quali = "qualifying" in lowered or "shootout" in lowered
    is_practice = "practice" in lowered
    kind = (
        "race"
        if is_race
        else "qualifying"
        if is_quali
        else "practice"
        if is_practice
        else "session"
    )
    lines.append(
        f"Session: {session_name or kind}, {info.get('total_laps')} laps, "
        f"{info.get('drivers')} entrants."
    )
    used.append("session")

    # Classification: every entrant, with the name the model should use.
    result = data_loader.get_session_result(session_key)
    classified: list[str] = []
    retired: list[str] = []
    if not result.empty and "position" in result.columns:
        rows = result.copy()
        rows["position"] = pd.to_numeric(rows["position"], errors="coerce")
        rows = rows.sort_values("position", na_position="last")
        for row in rows.itertuples():
            status = (
                "DNF"
                if bool(getattr(row, "dnf", False))
                else "DNS"
                if bool(getattr(row, "dns", False))
                else "DSQ"
                if bool(getattr(row, "dsq", False))
                else ""
            )
            who = f"{name(row.driver_number)} ({code(row.driver_number)})"
            if pd.notna(getattr(row, "position", None)):
                gap = getattr(row, "gap_to_leader", None)
                gap_txt = (
                    f" +{float(gap):.3f}s"
                    if pd.notna(gap) and float(gap) > 0
                    else " winner"
                    if is_race and int(row.position) == 1
                    else ""
                )
                points = getattr(row, "points", None)
                pts = (
                    f" {float(points):g}pts"
                    if is_race and pd.notna(points) and float(points) > 0
                    else ""
                )
                laps_done = getattr(row, "number_of_laps", None)
                laps_txt = f" {int(laps_done)} laps" if pd.notna(laps_done) else ""
                classified.append(f"P{int(row.position)} {who}{gap_txt}{pts}{laps_txt}.")
            else:
                retired.append(f"{who} {status or 'not classified'}")
        if classified:
            label = (
                "Full classification"
                if kind == "race"
                else "Qualifying classification"
                if kind == "qualifying"
                else "Practice order (as recorded)"
                if kind == "practice"
                else "Session order"
            )
            lines.append(f"{label}:\n" + "\n".join(classified))
            used.append("classification")
        # First position recorded for each driver, for "gained/lost" questions.
        try:
            if kind != "race":
                raise LookupError("not a race")
            positions_feed = data_loader.get_position(session_key)
            if not positions_feed.empty and {"driver_number", "position", "date"} <= set(
                positions_feed.columns
            ):
                feed = positions_feed.copy()
                feed["date"] = data_loader.to_dt(feed["date"])
                feed = feed.sort_values("date")
                first = feed.drop_duplicates(subset=["driver_number"], keep="first")
                start_pos = {
                    int(row.driver_number): int(row.position)
                    for row in first.itertuples()
                    if pd.notna(row.position) and 1 <= int(row.position) <= 30
                }
                finish = {
                    int(row.driver_number): int(row.position)
                    for row in result.itertuples()
                    if pd.notna(getattr(row, "position", None))
                }
                movement = []
                for driver, start in sorted(start_pos.items(), key=lambda item: item[1]):
                    end = finish.get(driver)
                    if end is None:
                        continue
                    delta = start - end
                    if delta == 0:
                        continue
                    movement.append(
                        f"{name(driver)} P{start} to P{end} ("
                        f"{'+' if delta > 0 else ''}{delta})"
                    )
                if movement:
                    lines.append(
                        "First recorded position to finish (positive gained places): "
                        + ", ".join(movement)
                        + "."
                    )
                    used.append("position changes")
        except Exception:
            pass

        if kind == "qualifying":
            lines.append(
                "Note: this is the official qualifying classification; the fastest lap "
                "line can belong to a driver classified lower (a deleted lap or no "
                "improvement). Do not call the classified leader the fastest unless the "
                "fastest-lap line agrees."
            )
            used.append("session note")
        if kind == "practice":
            lines.append(
                "Note: the practice order is the recorded classification and may not "
                "match the fastest lap. Do not call the first driver the fastest unless "
                "the fastest-lap line says so."
            )
            used.append("session note")
        if kind == "race":
            if retired:
                lines.append("Did not finish / not classified: " + "; ".join(retired) + ".")
                used.append("retirements")
            else:
                lines.append(
                    "Retirements: none — every entrant was classified at the finish."
                )
                used.append("retirements")

    laps = data_loader.list_laps(session_key)
    winner = None
    if not result.empty and "position" in result.columns:
        first = result[pd.to_numeric(result["position"], errors="coerce") == 1]
        if not first.empty:
            winner = int(first.iloc[0]["driver_number"])
    if not laps.empty and "lap_duration" in laps.columns:
        timed = laps.dropna(subset=["lap_duration"]).copy()
        timed["lap_duration"] = pd.to_numeric(timed["lap_duration"], errors="coerce")
        timed = timed.dropna(subset=["lap_duration"])
        if not timed.empty:
            median = float(timed["lap_duration"].median())
            clean = timed[timed["lap_duration"] <= median * 1.6]
            ordered = clean.sort_values("lap_duration")
            best = ordered.iloc[0]
            lines.append(
                f"Fastest lap: {name(best['driver_number'])} ({code(best['driver_number'])}) "
                f"{float(best['lap_duration']):.3f}s on lap {int(best['lap_number'])}."
            )
            used.append("fastest lap")
            best_per_driver = (
                ordered.drop_duplicates(subset=["driver_number"], keep="first")
                .sort_values("lap_duration")
                .head(3)
            )
            podium_laps = [
                f"{name(row.driver_number)} {float(row.lap_duration):.3f}s"
                for row in best_per_driver.itertuples()
            ]
            lines.append("Best lap per driver (top three): " + ", ".join(podium_laps) + ".")

            def sectors(row) -> str:
                values = [getattr(row, f"duration_sector_{i}", None) for i in (1, 2, 3)]
                if any(v is None or pd.isna(v) for v in values):
                    return ""
                return "S1 {:.3f} S2 {:.3f} S3 {:.3f}".format(*[float(v) for v in values])

            best_sectors = sectors(best)
            if best_sectors:
                lines.append(
                    f"Fastest-lap sectors ({code(best['driver_number'])}): {best_sectors}."
                )

            # Reference for "where did time go": best sector and ideal lap.
            best_each: list[str] = []
            total_ideal = 0.0
            for index in (1, 2, 3):
                column = f"duration_sector_{index}"
                if column not in clean.columns:
                    continue
                numeric = pd.to_numeric(clean[column], errors="coerce")
                if numeric.notna().sum() == 0:
                    continue
                idx = numeric.idxmin()
                total_ideal += float(numeric.loc[idx])
                who = code(clean.loc[idx, "driver_number"])
                best_each.append(f"S{index} {float(numeric.loc[idx]):.3f} ({who})")
            if best_each:
                lines.append(
                    "Best sector in the session: " + ", ".join(best_each) + "."
                )
                lines.append(
                    f"Theoretical best lap (sum of those sectors): {total_ideal:.3f}s."
                )
                used.append("ideal lap")

            pace = []
            for driver, rows in clean.groupby("driver_number"):
                if len(rows) < 5:
                    continue
                pace.append(
                    (
                        name(driver),
                        float(rows["lap_duration"].min()),
                        float(rows["lap_duration"].median()),
                    )
                )
            pace.sort(key=lambda row: row[2])
            if pace:
                lines.append(
                    "Median clean-lap pace (best five): "
                    + ", ".join(f"{d} {m:.3f}s (best {b:.3f}s)" for d, b, m in pace[:5])
                    + "."
                )
                used.append("pace")

            # Consistency: how far a driver's typical lap sits from their best.
            spread = []
            for driver, rows in clean.groupby("driver_number"):
                if len(rows) < 5:
                    continue
                best = float(rows["lap_duration"].min())
                median = float(rows["lap_duration"].median())
                spread.append((name(driver), median - best))
            spread.sort(key=lambda row: row[1])
            if spread:
                lines.append(
                    "Consistency, median clean lap minus personal best (lower is better): "
                    + ", ".join(f"{d} {gap:.3f}s" for d, gap in spread[:8])
                    + "."
                )
                used.append("consistency")

            if winner is not None:
                win_rows = clean[clean["driver_number"] == winner]
                if not win_rows.empty:
                    win_best = win_rows.loc[win_rows["lap_duration"].idxmin()]
                    win_sectors = sectors(win_best)
                    if win_sectors:
                        lines.append(
                            f"Winner's best lap ({name(winner)} "
                            f"{float(win_best['lap_duration']):.3f}s): {win_sectors}."
                        )

    pit = data_loader.get_pit(session_key) if kind == "race" else pd.DataFrame()
    if not pit.empty and "driver_number" in pit.columns and "stop_duration" in pit.columns:
        stops = pit.copy()
        stops["stop_duration"] = pd.to_numeric(stops["stop_duration"], errors="coerce")
        stops = stops.dropna(subset=["stop_duration"]).sort_values(["driver_number", "lap_number"])
        stops["stop_number"] = stops.groupby("driver_number").cumcount() + 1
        detail = "; ".join(
            f"{name(row.driver_number)} lap {int(row.lap_number)} "
            f"(stop {int(row.stop_number)}) {float(row.stop_duration):.1f}s"
            for row in stops.itertuples()
        )
        lines.append(
            f"Pit stops, all {len(stops)} "
            f"(driver, lap, stop number, stationary time): {detail}."
        )
        if len(stops):
            quick = stops.loc[stops["stop_duration"].idxmin()]
            slow = stops.loc[stops["stop_duration"].idxmax()]
            lines.append(
                f"Fastest stop: {name(quick.driver_number)} on lap {int(quick.lap_number)} "
                f"(stop {int(quick.stop_number)}) {float(quick.stop_duration):.1f}s. "
                f"Slowest: {name(slow.driver_number)} on lap {int(slow.lap_number)} "
                f"(stop {int(slow.stop_number)}) {float(slow.stop_duration):.1f}s."
            )
        used.append("pit stops")

    stints = data_loader.get_stints(session_key)
    if not stints.empty and {"driver_number", "compound"} <= set(stints.columns):
        short = {"SOFT": "S", "MEDIUM": "M", "HARD": "H", "INTERMEDIATE": "I", "WET": "W"}
        focus: list[int] = []
        if not result.empty and "position" in result.columns:
            ranked = result.copy()
            ranked["position"] = pd.to_numeric(ranked["position"], errors="coerce")
            top5 = ranked.dropna(subset=["position"]).sort_values("position").head(5)
            focus = [int(row.driver_number) for row in top5.itertuples()]
        elif winner is not None:
            focus = [winner]
        plans = []
        for driver in focus:
            rows = stints[stints["driver_number"] == driver].sort_values("lap_start")
            if rows.empty:
                continue
            parts = []
            for row in rows.itertuples():
                compound = short.get(str(getattr(row, "compound", "")).upper())
                start = getattr(row, "lap_start", None)
                end = getattr(row, "lap_end", None)
                if compound and pd.notna(start) and pd.notna(end):
                    parts.append(f"{compound} {int(start)}-{int(end)}")
            if parts:
                plans.append(f"{name(driver)}: " + ", ".join(parts))
        if plans:
            lines.append("Tyre plans, top five (compound, lap range): " + " | ".join(plans) + ".")
            used.append("tyre plans")

    overtakes = data_loader.get_overtakes(session_key) if kind == "race" else pd.DataFrame()
    if not overtakes.empty and "overtaking_driver_number" in overtakes.columns:
        made = overtakes.groupby("overtaking_driver_number").size().sort_values(ascending=False)
        top = ", ".join(f"{name(d)} {int(n)}" for d, n in made.head(3).items())
        lines.append(f"Most overtakes: {top}.")
        used.append("overtakes")

    # Weather and race control only if the feed answers; each is cached.
    try:
        weather = data_loader.get_weather(session_key)
    except Exception:
        weather = pd.DataFrame()
    if not weather.empty and "track_temperature" in weather.columns:
        try:
            track = pd.to_numeric(weather["track_temperature"], errors="coerce")
            air = pd.to_numeric(weather.get("air_temperature"), errors="coerce")
            rain = pd.to_numeric(weather.get("rainfall"), errors="coerce")
            pieces = [f"track {track.min():.0f}-{track.max():.0f}°C"]
            if air is not None and air.notna().any():
                pieces.append(f"air {air.min():.0f}-{air.max():.0f}°C")
            if rain is not None and rain.notna().any():
                pieces.append("rain" if float(rain.max()) > 0 else "dry")
            lines.append("Weather: " + ", ".join(pieces) + ".")
            used.append("weather")
        except Exception:
            pass

    try:
        control = data_loader.get_race_control(session_key)
    except Exception:
        control = pd.DataFrame()
    if not control.empty and "message" in control.columns:
        text = control["message"].fillna("").astype(str)
        sc = int(text.str.contains("SAFETY CAR", case=False, regex=False).sum())
        vsc = int(text.str.contains("VIRTUAL SAFETY CAR", case=False, regex=False).sum())
        red = int(text.str.contains("RED FLAG", case=False, regex=False).sum())
        if sc or vsc or red:
            lines.append(
                f"Neutralisations: {sc} safety-car messages, {vsc} virtual safety car, "
                f"{red} red flag."
            )
            used.append("race control")
        notable = control[
            text.str.contains("COLLISION|STOPPED|RETIRED|PENALTY", case=False, regex=True)
        ].head(3)
        for row in notable.itertuples():
            message = str(getattr(row, "message", "")).strip().replace("\n", " ")
            if message:
                lines.append(f"Race control note: {message[:140]}")
                used.append("race control")

    ordered_used = list(dict.fromkeys(used))
    return "\n".join(lines), ordered_used


class RecapRequest(BaseModel):
    session_key: int


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_key: int
    messages: list[ChatTurn]


class PitExplainRequest(PitCallRequest):
    session_key: int
    driver: str = ""
    compound: str = ""
    tyre_age: int | None = None
    laps_done: int | None = None


@app.get("/ai/status")
def ai_status() -> dict:
    return {**ai.status(), "ready": ai.configured()}


@app.post("/ai/chat")
def ai_chat(body: ChatRequest) -> dict:
    """Answer the last turn with bounded conversation context."""
    if not ai.configured():
        raise HTTPException(503, "AI is not configured: set OPENCODE_API_KEY on the server")
    history: list[dict] = []
    for turn in body.messages[-10:]:
        if turn.role not in ("user", "assistant"):
            raise HTTPException(422, "messages may only be user or assistant turns")
        content = turn.content.strip()
        if not content:
            continue
        history.append(
            {"role": turn.role, "content": content[:600 if turn.role == "user" else 1600]}
        )
    if not history or history[-1]["role"] != "user":
        raise HTTPException(422, "the last message must be a question")
    question = history[-1]["content"]
    if not 3 <= len(question) <= 400:
        raise HTTPException(422, "questions must be between 3 and 400 characters")
    facts, used = _ai_facts(body.session_key)
    try:
        text = ai.chat(body.session_key, facts, history)
    except ai.AINotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(502, "the AI provider did not answer, try again") from exc
    return {"answer": text, "model": ai.MODEL, "grounded_on": used}


@app.post("/ai/pit")
def ai_pit_explain(body: PitExplainRequest) -> dict:
    """Explain a pit call that the deterministic model already computed."""
    if not ai.configured():
        raise HTTPException(503, "AI is not configured: set OPENCODE_API_KEY on the server")
    call = analysis.pit_toy_model(
        body.base_pace_s,
        body.fresh_pace_s,
        body.deg_slope_s_per_lap,
        body.laps_remaining,
        body.pit_loss_s,
        body.gap_behind_s,
    )
    lean = (
        "pit"
        if call["pit_total_s"] < call["stay_total_s"]
        else "stay out"
        if call["stay_total_s"] < call["pit_total_s"]
        else "tie"
    )
    notes = (
        f"Driver: {body.driver or 'the followed car'}. Tyre: {body.compound or 'unknown'}"
        + (f", {body.tyre_age} laps old" if body.tyre_age is not None else "")
        + (f". Laps done: {body.laps_done}" if body.laps_done is not None else "")
        + f". Laps remaining: {body.laps_remaining}.\n"
        f"Measured current pace: {body.base_pace_s:.3f}s. Fresh-tyre pace: "
        f"{body.fresh_pace_s:.3f}s. Degradation: {body.deg_slope_s_per_lap:.3f}s per lap.\n"
        f"Pit loss: {body.pit_loss_s:.1f}s. Gap behind: "
        + (f"{body.gap_behind_s:.1f}s" if body.gap_behind_s is not None else "not recorded")
        + f".\nModel totals: stay out {call['stay_total_s']:.1f}s vs pit "
        f"{call['pit_total_s']:.1f}s. The model leans: {lean}. "
        f"Break-even pit loss: {call['break_even_pit_loss_s']:.1f}s. "
        f"Wear adds {call['deg_total_s']:.1f}s to both totals. "
        f"Traffic on exit: {'yes' if call['traffic_on_exit'] else 'no'}. "
        f"This is an explicit toy model: no safety car, linear degradation, "
        f"and the pit loss is an assumption."
    )
    try:
        text = ai.explain_pit(body.session_key, notes)
    except ai.AINotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(502, "the AI provider did not answer, try again") from exc
    return {"answer": text, "model": ai.MODEL, "call": call}


@app.post("/ai/recap")
def ai_recap(body: RecapRequest) -> dict:
    if not ai.configured():
        raise HTTPException(503, "AI is not configured: set OPENCODE_API_KEY on the server")
    facts, used = _ai_facts(body.session_key)
    try:
        text = ai.recap(body.session_key, facts)
    except ai.AINotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(502, "the AI provider did not answer, try again") from exc
    return {"answer": text, "model": ai.MODEL, "grounded_on": used}
