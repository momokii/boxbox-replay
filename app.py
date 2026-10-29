"""BoxBox Replay — M1: chooser + picker + lap table.

Flow: year -> Grand Prix -> session (telemetry-gated) -> drivers (max 3) ->
lap table; clicking a lap row loads it into session_state.selected_lap
(M2/M3 turn the selection into map + traces).
"""

import time

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

import analysis
import coach
import data_loader
import viz
from analysis import NOISE_THRESHOLD, best_lap, corner_losses, detect_corners, map_plane
from data_loader import clamp_selection, downsample_5hz, format_lap_time

st.set_page_config(page_title="BoxBox Replay", layout="wide")
st.title("BoxBox Replay")


@st.cache_data
def _years() -> list[int]:
    return data_loader.list_years()


@st.cache_data
def _meetings(year: int) -> pd.DataFrame:
    return data_loader.list_meetings(year)


@st.cache_data
def _sessions(year: int, meeting_key: int) -> pd.DataFrame:
    return data_loader.sessions_for_meeting(year, meeting_key)


@st.cache_data
def _telemetry_map(session_keys: tuple[int, ...]) -> dict[int, str]:
    """session_key -> '' if usable, else the hide reason."""
    return {k: data_loader.session_has_telemetry(k)[1] for k in session_keys}


@st.cache_data
def _drivers(session_key: int) -> pd.DataFrame:
    return data_loader.list_drivers(session_key)


@st.cache_data
def _laps(session_key: int) -> pd.DataFrame:
    return data_loader.list_laps(session_key)


@st.cache_data
def _intervals(session_key: int) -> pd.DataFrame:
    return data_loader.get_intervals(session_key)


@st.cache_data
def _lap_car(session_key: int, driver_number: int, lap_number: int) -> pd.DataFrame:
    return data_loader.lap_car_data(session_key, driver_number, lap_number)


@st.cache_data
def _team_colors(session_key: int) -> dict[int, str]:
    return data_loader.team_colors(session_key)


@st.cache_data
def _location(session_key: int, driver_number: int) -> pd.DataFrame:
    return data_loader.get_location(session_key, driver_number)


@st.cache_data
def _car(session_key: int, driver_number: int) -> pd.DataFrame:
    return data_loader.get_car_data(session_key, driver_number=driver_number)


@st.cache_data
def _coach_answer(cache_key: str, prompt: str) -> str | None:
    _ = cache_key  # part of the key so reruns and playback never re-fire the LLM
    return coach.ask_llm(prompt)


@st.cache_data
def _stints(session_key: int) -> pd.DataFrame:
    return data_loader.get_stints(session_key)


@st.cache_data
def _weather(session_key: int) -> pd.DataFrame:
    return data_loader.get_weather(session_key)


@st.cache_data
def _radio(session_key: int) -> pd.DataFrame:
    return data_loader.get_team_radio(session_key)


@st.cache_data
def _race_control(session_key: int) -> pd.DataFrame:
    return data_loader.get_race_control(session_key)


years = _years()
year = st.selectbox("Season", years, index=len(years) - 1)

meetings = _meetings(year)
if meetings.empty:
    st.warning(f"No sessions found for {year}.")
    st.stop()

gp_labels = {
    int(r.meeting_key): f"{r.meeting_name} - {r.location} ({int(r.sessions)} sessions)"
    for r in meetings.itertuples()
}
meeting_key = st.selectbox("Grand Prix", options=list(gp_labels), format_func=gp_labels.get)

sessions = _sessions(year, int(meeting_key))
keys = tuple(int(k) for k in sessions["session_key"].tolist())
reasons = _telemetry_map(keys)

usable = sessions[[reasons[k] == "" for k in keys]]
hidden = sessions[[reasons[k] != "" for k in keys]]

if not hidden.empty:
    with st.expander(f"{len(hidden)} session(s) hidden"):
        for r in hidden.itertuples():
            st.caption(f"{r.session_name}: {reasons[int(r.session_key)]}")

if usable.empty:
    st.warning("No sessions with telemetry for this Grand Prix.")
    st.stop()

sess_labels = {
    int(r.session_key): f"{r.session_name} ({str(r.date_start)[:10]})" for r in usable.itertuples()
}
session_key = st.selectbox("Session", options=list(sess_labels), format_func=sess_labels.get)

drivers = _drivers(int(session_key))
if drivers.empty:
    st.warning("No drivers listed for this session.")
    st.stop()

driver_opts = [f"#{int(r.driver_number)} {r.name_acronym}" for r in drivers.itertuples()]
picked = st.multiselect("Drivers (max 3)", driver_opts, default=driver_opts[:2])
picked = clamp_selection(picked, 3)
st.session_state["_picked"] = picked

laps = _laps(int(session_key))
if laps.empty:
    st.warning("No lap data for this session.")
    st.stop()

if picked:
    wanted = {int(p.split()[0][1:]) for p in picked}
    laps = laps[laps["driver_number"].isin(wanted)]


def _driver_label(n: int) -> str:
    tag = f"#{int(n)} "
    return next((d for d in driver_opts if d.startswith(tag)), f"#{int(n)}")


table = pd.DataFrame(
    {
        "Lap": laps["lap_number"].astype(int),
        "Driver": laps["driver_number"].map(_driver_label),
        "Time": laps["lap_duration"].map(format_lap_time),
        "Pit out": laps.get("is_pit_out_lap", False).fillna(False).astype(bool),
    }
).sort_values(["Driver", "Lap"], ignore_index=True)

st.subheader(f"Lap table - {len(table)} laps")
event = st.dataframe(
    table,
    use_container_width=True,
    hide_index=True,
    selection_mode="single-row",
    on_select="rerun",
)

selected = event.selection.rows if event.selection else []
if selected:
    row = table.iloc[selected[0]]
    st.session_state["selected_lap"] = {
        "session_key": int(session_key),
        "driver": row["Driver"],
        "lap": int(row["Lap"]),
        "time": row["Time"],
    }

if "selected_lap" in st.session_state:
    sel = st.session_state["selected_lap"]
    st.info(
        f"Loaded lap: {sel['driver']} lap {sel['lap']} - "
        f"{sel['time']} (map + traces arrive in M2/M3)"
    )

# --- M2: battle — speed overlay + gap chart ---

st.subheader("Battle")

session_int = int(session_key)
all_laps = _laps(session_int)

sel = st.session_state.get("selected_lap")
if sel and sel.get("session_key") == session_int:
    ref_driver_label, ref_lap = sel["driver"], int(sel["lap"])
elif picked:
    try:
        ref_row = best_lap(all_laps)
        ref_driver_label, ref_lap = _driver_label(int(ref_row["driver_number"])), int(
            ref_row["lap_number"]
        )
    except ValueError:
        ref_driver_label, ref_lap = picked[0], 1
else:
    st.warning("Pick a session with lap data to start the battle view.")
    st.stop()

ref_num = int(ref_driver_label.split()[0][1:])
chal_default = picked[1] if len(picked) > 1 else picked[0] if picked else ref_driver_label
col_a, col_b = st.columns(2)
with col_a:
    st.markdown(f"**Reference:** {ref_driver_label} lap {ref_lap}")
with col_b:
    chal_driver_label = st.selectbox(
        "Challenger", driver_opts, index=driver_opts.index(chal_default)
    )
    chal_lap = st.number_input("Challenger lap", min_value=1, value=ref_lap, step=1)
chal_num = int(chal_driver_label.split()[0][1:])


def _trace_df(df: pd.DataFrame) -> pd.DataFrame:
    stamps = pd.to_datetime(df["date"], utc=True)
    return pd.DataFrame({"t": (stamps - stamps.iloc[0]).dt.total_seconds(), "speed": df["speed"]})


ref_car = _lap_car(session_int, ref_num, ref_lap)
chal_car = _lap_car(session_int, chal_num, int(chal_lap))
if ref_car.empty or chal_car.empty:
    st.warning("Telemetry missing for one of these laps (session may be telemetry-gated).")
else:
    colors = _team_colors(session_int)
    series = {ref_driver_label: _trace_df(ref_car), chal_driver_label: _trace_df(chal_car)}
    color_by_label = {
        ref_driver_label: colors.get(ref_num, "#8A94A6"),
        chal_driver_label: colors.get(chal_num, "#8A94A6"),
    }
    st.plotly_chart(viz.speed_trace(series, color_by_label), use_container_width=True)
    ref_t = all_laps.query("driver_number == @ref_num and lap_number == @ref_lap")
    chal_t = all_laps.query("driver_number == @chal_num and lap_number == @chal_lap")
    if not ref_t.empty and not chal_t.empty:
        delta = float(chal_t.iloc[0]["lap_duration"]) - float(ref_t.iloc[0]["lap_duration"])
        verdict = "noise - nothing to learn" if abs(delta) < NOISE_THRESHOLD else "real"
        st.markdown(f"**Delta:** `{delta:+.3f}s` ({verdict})")

st.subheader("Gap to leader")
intervals = _intervals(session_int)
if intervals.empty:
    st.warning("No interval data for this session.")
else:
    gap_labels = {int(n): _driver_label(int(n)) for n in intervals["driver_number"].unique()}
    if picked:
        keep = {int(p.split()[0][1:]) for p in picked}
        intervals = intervals[intervals["driver_number"].isin(keep)]
    st.plotly_chart(viz.gap_chart(intervals, gap_labels), use_container_width=True)

# --- M3: replay — synced track-map animation ---

st.subheader("Replay")
components.html(
    "<script>document.addEventListener('keydown', e => {"
    " if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {"
    "  e.preventDefault();"
    "  const btns = [...parent.document.querySelectorAll('button')];"
    "  const b = btns.find(x => x.innerText === 'Play' || x.innerText === 'Pause');"
    "  if (b) b.click(); } });</script>",
    height=0,
)

ref_sel = st.session_state.get("selected_lap")
if ref_sel and ref_sel.get("session_key") == session_int:
    replay_num = int(ref_sel["driver"].split()[0][1:])
    replay_lap = int(ref_sel["lap"])
else:
    try:
        ref_row = best_lap(all_laps)
        replay_num, replay_lap = int(ref_row["driver_number"]), int(ref_row["lap_number"])
    except ValueError:
        st.warning("No timed lap to replay yet.")
        st.stop()

ref_laps = all_laps.query("driver_number == @replay_num").sort_values("lap_number")
win_start = pd.Timestamp(ref_laps.query("lap_number == @replay_lap").iloc[0]["date_start"])
later = ref_laps.query("lap_number > @replay_lap")["date_start"].min()
win_end = pd.Timestamp(later) if pd.notna(later) else win_start + pd.Timedelta(seconds=100)
win_dur = min(150.0, (win_end - win_start).total_seconds())

replay_nums = [int(p.split()[0][1:]) for p in picked] or [replay_num]
if replay_num not in replay_nums:
    replay_nums = [replay_num, *replay_nums][:3]
colors = _team_colors(session_int)

plane_src = _location(session_int, replay_num)
if plane_src.empty:
    st.warning("No location data for this session — map hidden.")
    st.stop()
ax, ay = map_plane(plane_src)

outline_full = plane_src.iloc[::15].reset_index(drop=True)
outline = pd.DataFrame({"x": outline_full[ax], "y": outline_full[ay]})
corners = detect_corners(outline)

win_end_ts = win_start + pd.Timedelta(seconds=win_dur)
win_locs: dict[int, pd.DataFrame] = {}
win_cars: dict[int, pd.DataFrame] = {}
for num in replay_nums:
    loc = _location(session_int, num)
    stamps = pd.to_datetime(loc["date"], utc=True)
    win_locs[num] = downsample_5hz(loc[(stamps >= win_start) & (stamps < win_end_ts)])
    car = _car(session_int, num)
    cstamps = pd.to_datetime(car["date"], utc=True)
    win_cars[num] = car[(cstamps >= win_start) & (cstamps < win_end_ts)].reset_index(drop=True)

if "play_t" not in st.session_state:
    st.session_state["play_t"] = 0.0
if "playing" not in st.session_state:
    st.session_state["playing"] = False
if "speed" not in st.session_state:
    st.session_state["speed"] = 1.0

top_a, top_b, top_c = st.columns([3, 1, 1])
with top_a:
    gp_name = meetings.set_index("meeting_key").loc[int(meeting_key), "meeting_name"]
    st.markdown(f"**{gp_name}** — lap {replay_lap} replay window ({win_dur:.0f}s)")
with top_b:
    if st.button("Pause" if st.session_state["playing"] else "Play"):
        st.session_state["playing"] = not st.session_state["playing"]
with top_c:
    SPEEDS = [1.0, 2.0, 4.0]
    idx = SPEEDS.index(st.session_state["speed"])
    st.session_state["speed"] = st.selectbox("Speed", SPEEDS, index=idx)

play_t = st.slider("Scrub", 0.0, float(win_dur), float(st.session_state["play_t"]), 0.2)
st.session_state["play_t"] = play_t
now = win_start + pd.Timedelta(seconds=play_t)

tower_rows = []
for num in replay_nums:
    iv = intervals.query("driver_number == @num and date <= @now").sort_values("date")
    last_gap = iv.iloc[-1]["gap_to_leader"] if not iv.empty else None
    gap = float(last_gap) if pd.notna(last_gap) else None
    tower_rows.append({"num": num, "gap": gap})
tower_rows.sort(key=lambda r: (r["gap"] is None, r["gap"] if r["gap"] is not None else 0))

dots = []
for pos, r in enumerate(tower_rows, start=1):
    num = r["num"]
    loc = win_locs.get(num, pd.DataFrame())
    if loc.empty:
        continue
    past = loc[pd.to_datetime(loc["date"], utc=True) <= now]
    if past.empty:
        continue
    cur = past.iloc[-1]
    tail = past.tail(25)
    car = win_cars.get(num, pd.DataFrame())
    speed_now, gear_now, thr_now = 0.0, 0, 0
    if not car.empty:
        deltas = (pd.to_datetime(car["date"], utc=True) - now).abs()
        nearest = car.iloc[deltas.argsort()[:1]]
        speed_now = float(nearest.iloc[0]["speed"])
        gear_now = int(nearest.iloc[0]["n_gear"])
        thr_now = int(nearest.iloc[0]["throttle"])
    label = next((p for p in picked if p.startswith(f"#{num} ")), f"#{num}")
    dots.append(
        {
            "label": label,
            "color": colors.get(num, "#8A94A6"),
            "x": float(cur[ax]),
            "y": float(cur[ay]),
            "speed": speed_now,
            "extra": f"{speed_now:.0f} km/h, gear {gear_now}, throttle {thr_now}",
            "tail": (tail[ax].tolist(), tail[ay].tolist()),
        }
    )
    gap_txt = f"+{r['gap']:.3f}" if r["gap"] else "—"
    tower_rows[pos - 1]["line"] = (label, colors.get(num, "#8A94A6"), gap_txt)

map_col, eng_col = st.columns([3, 1])
with map_col:
    st.caption("Click a corner diamond, or pick one below. Playback keeps running.")
    map_event = st.plotly_chart(
        viz.track_map(outline, dots, corners), use_container_width=True,
        selection_mode="points", on_select="rerun",
    )
clicked_corner: str | None = None
try:
    pts = (map_event.selection.points if map_event and map_event.selection else []) or []
except AttributeError:
    pts = []
for p in pts:
    if isinstance(p, dict):
        px, py = p.get("x"), p.get("y")
    else:
        px, py = getattr(p, "x", None), getattr(p, "y", None)
    if px is None or py is None:
        continue
    span = max(outline["x"].max() - outline["x"].min(), outline["y"].max() - outline["y"].min())
    dist = ((corners["x"] - px) ** 2 + (corners["y"] - py) ** 2) ** 0.5
    near = dist[dist <= span * 0.03]
    if not near.empty:
        clicked_corner = corners.loc[near.idxmin(), "label"]
        break
if clicked_corner:
    st.session_state["selected_corner"] = clicked_corner
corner_options = corners["label"].tolist() if corners is not None and not corners.empty else []
if corner_options:
    default_corner = st.session_state.get("selected_corner", corner_options[0])
    st.session_state["selected_corner"] = st.selectbox(
        "Corner", corner_options,
        index=corner_options.index(default_corner) if default_corner in corner_options else 0,
    )
with eng_col:
    st.markdown("**Timing tower**")
    for i, r in enumerate(tower_rows, start=1):
        label, color, gap_txt = r.get("line", (f"#{r['num']}", "#8A94A6", "—"))
        st.markdown(f"P{i} `{label}` — {gap_txt}")
    st.divider()
    st.markdown("**RACE ENGINEER**")
    sel_corner = st.session_state.get("selected_corner")
    if sel_corner and not corners.empty:
        with st.spinner(f"Coach analysing {sel_corner}..."):
            chal_laps = all_laps.query("driver_number == @chal_num").sort_values("lap_number")
            ref_laps = all_laps.query("driver_number == @ref_num").sort_values("lap_number")
            c_start, c_end = data_loader.lap_window(chal_laps, int(chal_lap))
            r_start, r_end = data_loader.lap_window(ref_laps, int(ref_lap))
            losses = pd.DataFrame()
            if c_start is not None and r_start is not None:
                c_loc = _location(session_int, chal_num)
                r_loc = _location(session_int, ref_num)
                c_end_ts = c_end if c_end is not None else c_start + pd.Timedelta(seconds=120)
                r_end_ts = r_end if r_end is not None else r_start + pd.Timedelta(seconds=120)
                c_stamps = pd.to_datetime(c_loc["date"], utc=True)
                r_stamps = pd.to_datetime(r_loc["date"], utc=True)
                c_trace = c_loc[(c_stamps >= c_start) & (c_stamps < c_end_ts)]
                r_trace = r_loc[(r_stamps >= r_start) & (r_stamps < r_end_ts)]
                losses = corner_losses(outline, corners, c_trace, r_trace, ax, ay)
        row = losses.query("label == @sel_corner") if not losses.empty else pd.DataFrame()
        if row.empty or pd.isna(row.iloc[0]["loss_s"]):
            st.caption(f"{sel_corner}: no overlapping telemetry — nothing measured.")
        else:
            loss = float(row.iloc[0]["loss_s"])
            conf = coach.confidence_for(loss)
            basis = f"based on lap {chal_lap} vs ref {ref_lap}"
            ref_t = ref_laps.query("lap_number == @ref_lap")
            chal_t = chal_laps.query("lap_number == @chal_lap")
            lap_delta = None
            if not ref_t.empty and not chal_t.empty:
                ref_dur = float(ref_t.iloc[0]["lap_duration"])
                chal_dur = float(chal_t.iloc[0]["lap_duration"])
                lap_delta = chal_dur - ref_dur
            prompt = coach.build_prompt(
                chal_driver_label, int(chal_lap), ref_driver_label,
                int(ref_lap), sel_corner, loss, lap_delta,
            )
            key = f"{session_int}:{chal_num}:{chal_lap}:{ref_num}:{ref_lap}:{sel_corner}"
            answer = _coach_answer(key, prompt)
            st.markdown(f"**{sel_corner}** — corner loss `{loss:+.3f}s`")
            if answer:
                question = f"What should I have done in {sel_corner}?"
                st.markdown(coach.render_radio(question, answer, conf, basis))
            else:
                st.caption("LLM unreachable here — measured loss above stands as-is.")
                st.caption(f"`[{conf}]` *{basis}* (numbers only, no advice generated)")
    else:
        st.caption("Click a corner diamond to load the coach.")

strip_series, strip_colors = {}, {}
for num in replay_nums:
    car = win_cars.get(num, pd.DataFrame())
    if car.empty:
        continue
    stamps = pd.to_datetime(car["date"], utc=True)
    label = next((p for p in picked if p.startswith(f"#{num} ")), f"#{num}")
    strip_series[label] = pd.DataFrame(
        {"t": (stamps - win_start).dt.total_seconds(), "speed": car["speed"]}
    )
    strip_colors[label] = colors.get(num, "#8A94A6")
if strip_series:
    fig = viz.speed_trace(strip_series, strip_colors, playhead_s=play_t)
    st.plotly_chart(fig, use_container_width=True)

if st.session_state["playing"]:
    if play_t >= win_dur:
        st.session_state["playing"] = False
    else:
        time.sleep(0.5)
        step = 0.5 * float(st.session_state["speed"])
        st.session_state["play_t"] = min(float(win_dur), play_t + step)
        st.rerun()

# --- M5: performance mode — deg slope + stints + weather + radio ---

st.subheader("Performance")

stints = _stints(session_int)
if not stints.empty and picked:
    keep_nums = {int(p.split()[0][1:]) for p in picked}
    stints = stints[stints["driver_number"].isin(keep_nums)]
if stints.empty:
    st.caption("No stint data for this session.")
else:
    stint_labels = {int(n): _driver_label(int(n)) for n in stints["driver_number"].unique()}
    st.plotly_chart(viz.stint_timeline(stints, stint_labels), use_container_width=True)
    slope_lines = []
    for (num, grp) in stints.groupby("driver_number"):
        for s in grp.itertuples():
            seg = all_laps.query(
                "driver_number == @num and lap_number >= @s.lap_start and lap_number <= @s.lap_end"
            )
            try:
                slope = analysis.tyre_slope(seg)
                slope_lines.append(f"{_driver_label(int(num))} {s.compound}: `{slope:+.3f}s/lap`")
            except ValueError:
                slope_lines.append(f"{_driver_label(int(num))} {s.compound}: too few laps")
    st.markdown("Degradation slope — " + " · ".join(slope_lines))

weather = _weather(session_int)
if not weather.empty:
    w = weather.sort_values("date").iloc[-1]
    met_a, met_b, met_c, met_d = st.columns(4)
    met_a.metric("Air", f"{w['air_temperature']:.1f}°C")
    met_b.metric("Track", f"{w['track_temperature']:.1f}°C")
    met_c.metric("Humidity", f"{w['humidity']:.0f}%")
    met_d.metric("Rain", f"{w['rainfall']:.0f}mm")

radio = _radio(session_int)
rc = _race_control(session_int)
radio_col, rc_col = st.columns(2)
with radio_col:
    st.markdown("**Team radio** (replay window)")
    if radio.empty:
        st.caption("No radio events.")
    else:
        rstamps = pd.to_datetime(radio["date"], utc=True)
        in_win = radio[(rstamps >= win_start) & (rstamps < win_end_ts)].sort_values("date")
        if in_win.empty:
            st.caption("None in this window.")
        for r in in_win.itertuples():
            driver = _driver_label(int(r.driver_number))
            st.caption(f"{str(r.date)[11:19]} — {driver} — [audio]({r.recording_url})")
with rc_col:
    st.markdown("**Race control** (replay window)")
    if rc.empty:
        st.caption("No race-control messages.")
    else:
        cstamps = pd.to_datetime(rc["date"], utc=True)
        in_win = rc[(cstamps >= win_start) & (cstamps < win_end_ts)].sort_values("date")
        if in_win.empty:
            st.caption("None in this window.")
        for r in in_win.itertuples():
            flag = f" {r.flag}" if getattr(r, "flag", None) else ""
            st.caption(f"{str(r.date)[11:19]} — {r.category}{flag}: {r.message}")

# --- M6: what-if pit wall (TOY MODEL — not strategy advice) ---

st.subheader("What-if pit wall")
st.warning("TOY MODEL — linear deg, constant rivals, static pit loss. Not strategy advice.")

toy_nums = [int(p.split()[0][1:]) for p in picked] or [replay_num]
toy_num = toy_nums[0]
toy_laps = all_laps.query("driver_number == @toy_num").sort_values("lap_number")
timed = toy_laps.dropna(subset=["lap_duration"])
if len(timed) < 4:
    st.caption("Not enough timed laps for the toy model.")
else:
    base_pace = float(timed.tail(3)["lap_duration"].median())
    fresh_pace = float(analysis.best_lap(toy_laps)["lap_duration"])
    try:
        deg = max(0.0, analysis.tyre_slope(timed))
    except ValueError:
        deg = 0.0
    latest_iv = intervals.sort_values("date").groupby("driver_number").tail(1)
    gaps = latest_iv.set_index("driver_number")["gap_to_leader"].dropna()
    gap_behind = None
    if toy_num in gaps.index:
        behind = gaps[gaps > gaps[toy_num]]
        gap_behind = float((behind - gaps[toy_num]).min()) if not behind.empty else None
    toy_a, toy_b = st.columns(2)
    with toy_a:
        laps_left = st.number_input("Laps remaining", min_value=1, value=10, step=1)
    with toy_b:
        pit_loss = st.slider("Pit loss (s)", 15.0, 30.0, 22.0, 0.5)
    call = analysis.pit_toy_model(base_pace, fresh_pace, deg, int(laps_left), pit_loss, gap_behind)
    call_a, call_b, call_c = st.columns(3)
    call_a.metric("Stay out", f"{call['stay_total_s']:.1f}s")
    call_b.metric("Pit now", f"{call['pit_total_s']:.1f}s")
    call_c.metric("Traffic on exit", "YES" if call["traffic_on_exit"] else "clear")
    st.markdown(f"## {call['recommendation']}")
    st.caption(
        f"Pace now {base_pace:.3f}s, fresh {fresh_pace:.3f}s, deg +{deg:.3f}s/lap. "
        "Toy assumptions only."
    )
