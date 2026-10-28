"""BoxBox Replay — F1 Telemetry Viz + Race Replay + LLM Coach. (M0 shell)

M0: proves the data layer inside the app (sessions/year + Suzuka quali check).
Full Night Pit-Wall layout (tower / stage / engineer / strips) lands M1–M3.
"""

import streamlit as st

import data_loader

st.set_page_config(page_title="BoxBox Replay", layout="wide")

st.title("BoxBox Replay 🏁")
st.caption("Night Pit-Wall build-up in progress — M0: data layer proof inside the app.")

years = data_loader.list_years()


@st.cache_data
def _session_counts() -> dict[int, int]:
    return {year: len(data_loader.list_sessions(year)) for year in years}


counts = _session_counts()
st.subheader("OpenF1 reachability (cached parquet)")
st.table([{"year": year, "sessions": counts[year]} for year in years])

SUZUKA_QUALI_2024 = 9492


@st.cache_data
def _suzuka_laps() -> int:
    return len(data_loader.list_laps(SUZUKA_QUALI_2024))


st.metric("Suzuka 2024 quali lap rows (session 9492)", _suzuka_laps())
st.caption("M1: GP picker replaces this page. Empty sessions hidden, never faked.")
