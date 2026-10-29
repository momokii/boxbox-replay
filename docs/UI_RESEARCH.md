# UI Revamp Research — why Streamlit goes, what replaces it

Date: 2026-10-29. Question: which stack delivers a truly interactive,
broadcast-grade F1 replay UI (60fps map, shared playhead, custom layout,
mobile), given a proven Python data/analysis backend?

## What we learned building M0–M7 (first-hand)

- Playback is a **server rerun loop** (`time.sleep` + `st.rerun()`): ~2fps,
  full script re-execution per tick, all state round-trips through the server.
- Layout control is **hacks** (CSS injection, column ratios); no real
  responsive design, no component model, no client-side state.
- Selection (`on_select`) is constrained and version-fragile; Space shortcut
  needed DOM-scraping JS.
- Every real bug the smoke test caught was at the Streamlit boundary
  (selectors, empty frames, rerun interplay) — not in the backend.
- Verdict: Streamlit is a data-script runner, not an app framework for this UX.

## Primary-source findings

- **Streamlit execution model**: every interaction re-runs the whole script
  top-to-bottom (server roundtrip per tick).
  Source: https://docs.streamlit.io/develop/concepts/architecture/run-your-app
- **Dash clientside callbacks**: JS can run in the browser for high-frequency
  updates, avoiding server roundtrips — fixes animation, keeps Python backend.
  But layout/UX stays inside Dash's component framework.
  Source: https://dash.plotly.com/clientside-callbacks
- **Reflex**: pure-Python code compiled to a React/Next.js frontend — real
  client-side UX with one language; custom visuals need React wrapping;
  Docker self-host supported (single container, compose examples).
  Source: https://reflex.dev/docs/getting-started/introduction/,
  https://reflex.dev/docs/hosting/self-hosting/
- **React + FastAPI** (industry standard, no single page needed): full UX
  ceiling (canvas 60fps, client state, responsive), backend stays Python.
  Cost is a second codebase (JS/TS) and two services.

## Decision matrix

| Need | Streamlit | Dash | Reflex | React+FastAPI |
|---|---|---|---|---|
| 60fps canvas map, no roundtrips | no | partial (JS callbacks) | yes | yes |
| Shared client-side playhead | hacks | yes | yes | yes |
| Custom layout + mobile | no | partial | yes | yes |
| Keep one language (Python) | yes | yes | yes | no (TS frontend) |
| Reuse backend as-is | n/a | mostly | wrap | thin API wrap |
| Ecosystem risk | none | low | medium (young) | none |
| Build/maintain cost | sunk | medium | medium | highest |

## Recommendation

**React (Vite + TypeScript) SPA + FastAPI backend** — the backend
(`data_loader`, `analysis`, `coach`) is already API-shaped (pure functions +
cached fetch) and fully tested, so the wrap is thin. Canvas map + client state
delivers exactly the broadcast-grade replay asked for. Multi-stage Dockerfile
means the host needs no Node toolchain. Fallback if Python-only is required:
Reflex (80% of the ceiling, one language, real React output).
