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
    lap: int | None = None,
    t0: float | None = None,
    t1: float | None = None,
) -> dict:
    """One driver's inputs for a lap, or for a session-time window.

    Window mode (`t0`/`t1`, seconds on the replay clock) lets several drivers
    share one axis for comparison. Times in the response are seconds from the
    window start; missing channels come back as nulls, never as guesses.
    """
    if t0 is not None and t1 is not None and t1 > t0:
        clock_start, _end, markers, _dur = _session_clock(session_key)
        base = float(markers["t"].min()) if not markers.empty else 0.0
        win_start = clock_start + pd.Timedelta(seconds=base + t0)
        win_end = clock_start + pd.Timedelta(seconds=base + t1)
        duration = float(t1 - t0)
        window_t0: float | None = float(t0)
        lap_value: int | None = None
    else:
        if lap is None:
            raise HTTPException(400, "lap or t0/t1 required")
        laps_df = data_loader.list_laps(session_key, driver_number=driver_number)
        start, end = data_loader.lap_window(laps_df, lap)
        if start is None:
            raise HTTPException(404, f"lap {lap} not found for driver {driver_number}")
        row = laps_df[laps_df.get("lap_number") == lap].tail(1)
        duration = None
        measured = (
            row["lap_duration"].iloc[0]
            if not row.empty and "lap_duration" in row.columns
            else None
        )
        if measured is not None and pd.notna(measured):
            duration = float(measured)
        win_start = start
        win_end = end if end is not None else start + pd.Timedelta(seconds=duration or 150)
        window_t0 = None
        lap_value = lap

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
        "lap": lap_value,
        "lap_duration": duration,
        "window_t0": window_t0,
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
    answer = coach.ask_llm(prompt)
    if not answer:
        return {"answer": None, "confidence": conf, "basis": basis, "llm": False}
    return {
        "answer": coach.render_radio(
            f"What should I have done in {req.corner}?", answer, conf, basis
        ),
        "confidence": conf,
        "basis": basis,
        "llm": True,
    }


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
    lines.append(
        f"Session: {info.get('session_name')}, {info.get('total_laps')} laps, "
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
                    if int(row.position) == 1
                    else ""
                )
                points = getattr(row, "points", None)
                pts = f" {float(points):g}pts" if pd.notna(points) else ""
                laps_done = getattr(row, "number_of_laps", None)
                laps_txt = f" {int(laps_done)} laps" if pd.notna(laps_done) else ""
                classified.append(f"P{int(row.position)} {who}{gap_txt}{pts}{laps_txt}.")
            else:
                retired.append(f"{who} {status or 'not classified'}")
        if classified:
            lines.append("Full classification:\n" + "\n".join(classified))
            used.append("classification")
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

    pit = data_loader.get_pit(session_key)
    if not pit.empty and "driver_number" in pit.columns:
        durations = pd.to_numeric(pit.get("stop_duration"), errors="coerce")
        fastest = ""
        if durations is not None and durations.notna().any():
            idx = durations.idxmin()
            fastest = (
                f" Fastest stop {float(durations.loc[idx]):.1f}s "
                f"({name(pit.loc[idx, 'driver_number'])})."
            )
        lines.append(f"Pit stops: {len(pit)} in total.{fastest}")
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

    overtakes = data_loader.get_overtakes(session_key)
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


class AskRequest(BaseModel):
    session_key: int
    question: str


@app.get("/ai/status")
def ai_status() -> dict:
    return {**ai.status(), "ready": ai.configured()}


@app.post("/ai/ask")
def ai_ask(body: AskRequest) -> dict:
    if not ai.configured():
        raise HTTPException(503, "AI is not configured: set OPENCODE_API_KEY on the server")
    question = body.question.strip()
    if not 3 <= len(question) <= 300:
        raise HTTPException(422, "question must be between 3 and 300 characters")
    facts, used = _ai_facts(body.session_key)
    try:
        text = ai.answer(body.session_key, facts, question)
    except ai.AINotConfigured as exc:
        raise HTTPException(503, str(exc)) from exc
    except ai.AIError as exc:
        raise HTTPException(502, "the AI provider did not answer, try again") from exc
    return {"answer": text, "model": ai.MODEL, "grounded_on": used}


@app.post("/ai/recap")
def ai_recap(body: AskRequest) -> dict:
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
