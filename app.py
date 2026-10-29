"""BoxBox Replay — M1: chooser + picker + lap table.

Flow: year -> Grand Prix -> session (telemetry-gated) -> drivers (max 3) ->
lap table; clicking a lap row loads it into session_state.selected_lap
(M2/M3 turn the selection into map + traces).
"""

import pandas as pd
import streamlit as st

import data_loader
from data_loader import clamp_selection, format_lap_time

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
