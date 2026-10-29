"""BoxBox Replay — M1: chooser + picker + lap table.

Flow: year -> Grand Prix -> session (telemetry-gated) -> drivers (max 3) ->
lap table; clicking a lap row loads it into session_state.selected_lap
(M2/M3 turn the selection into map + traces).
"""

import time

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

import data_loader
import viz
from analysis import NOISE_THRESHOLD, best_lap, detect_corners, map_plane
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
    st.plotly_chart(viz.track_map(outline, dots, corners), use_container_width=True)
with eng_col:
    st.markdown("**Timing tower**")
    for i, r in enumerate(tower_rows, start=1):
        label, color, gap_txt = r.get("line", (f"#{r['num']}", "#8A94A6", "—"))
        st.markdown(f"P{i} `{label}` — {gap_txt}")
    st.divider()
    st.markdown("**RACE ENGINEER**")
    st.caption("Corner-click coach arrives in M4.")

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
