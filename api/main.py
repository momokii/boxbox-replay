"""BoxBox Replay API (R0): thin FastAPI wrap over data_loader/analysis/coach.

All domain logic lives in the tested modules; endpoints serialize to JSON.
Empty datasets serialize as [] (the UI renders empty states, never crashes).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import analysis
import coach
import data_loader

app = FastAPI(title="BoxBox Replay API")


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


@app.get("/session/info")
def session_info(session_key: int) -> dict:
    """Session clock + race distance: the numbers the UI should show."""
    start, end, _markers, race_duration = _session_clock(session_key)
    info = data_loader.get_session(session_key)
    laps = data_loader.list_laps(session_key)
    total = pd.to_numeric(laps["lap_number"], errors="coerce").max() if not laps.empty else 0
    return {
        "session_key": session_key,
        "session_name": info.get("session_name"),
        "date_start": str(start),
        "date_end": str(end),
        "duration_s": round(race_duration, 1),
        "total_laps": 0 if pd.isna(total) else int(total),
        "drivers": int(laps["driver_number"].nunique()) if not laps.empty else 0,
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
        cache = data_loader._session_cache(session_key, f"session_pos_{rate}hz.parquet")
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
