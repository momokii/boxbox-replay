# Redesign v2 — session-scale replay, day/night, data honesty

## What the user reported, and what's actually wrong

| Report | Root cause |
|---|---|
| "per session was just 90s" | The replay window was `min(150s, lap window)`. The app replays ONE LAP, not a session. |
| "not from beginning when start replay" | Window started at the best lap's timestamp, not session start. |
| "speed below circuit suddenly changes" | The strip showed "top 3 by current gap", so its drivers changed every frame. |
| "why not show all drivers" | Highlight-less mode showed only 3 traces, unlabeled. |
| "gap to leader weird / missing → just make it gone" | 15% of interval rows are `"+1 LAP"` (coerced to null); chart drew empty axes without saying so. |
| "1108 laps doesn't make sense" | Displayed lap *rows across all drivers*; real race distance is 56 laps. |
| "no day theme" | Single hard-coded dark palette. |

Also found while measuring: OpenF1 `car_data`/`location` for 2026 sessions include rows
**outside the session window** (11,663 of 34,914 rows for one driver — previous day and
an hour before lights out). Nothing clamped them, so positions and playback were wrong.

## Research anchor

Real tools in this space (MultiViewer, F1 live timing) share one model: a
**session-long clock**, a **driver tower ordered by gap**, a **map with the whole
field**, and **telemetry scoped to the drivers you chose**. Nobody replays a
single anonymous lap. Source: https://multiviewer.app/, https://openf1.org/docs/.

## Plan

### 1. Data model — session, not lap
- Clamp every telemetry frame to `[session.date_start, session.date_end]`.
- Build a cached per-session replay table: `driver, t, x, y, v` at ~2 Hz
  (adaptive to keep payload bounded), `t` = seconds from session start.
- Track outline/corners/DRS from one representative fast lap.
- Lap markers: `lap_number → t` so the timeline can show and jump to laps.
- Gaps: intervals when numeric; otherwise derive from real lap times
  (cumulative) and **say so**; when neither exists, hide the chart.

### 2. Layout — one clock rules everything
```
2026 · UNITED STATES GP · RACE            LAP 12/56      [day/night]
┌───────────┬──────────────────────────────────┬──────────────┐
│ tower     │  track map (all 22 cars, trails) │ engineer     │
│ gaps      ├──────────────────────────────────┤ corner card  │
│           │ session timeline ═══●═══════     │ or session   │
│           │ [play] [1x 2x 4x]  lap ticks     │ facts        │
│           ├──────────────────────────────────┤              │
│           │ speed (chosen drivers only)      │              │
│           │ gap to leader (chosen or top 5)  │              │
└───────────┴──────────────────────────────────┴──────────────┘
lap table (collapsed by default) · jump to lap
```

### 3. Honest states
- Speed: "Highlight drivers in the tower to compare their speed" when none chosen —
  never an unexplained changing set.
- Gap: hidden with one plain sentence when unavailable.
- Counts: "LAP 12 / 56", "22 drivers", never total rows.
- Loading: "Loading race data (14/22 drivers)…" with real progress.

### 4. Day / night
Same structure, two token sets, toggle persisted in localStorage, default night.
Day: paper `#F4F6F8`, ink `#0E1420`, panels `#FFFFFF`, rules `#D5DCE5`,
amber darkened to `#A86A00` for contrast on light. Data colors unchanged.

### 5. Verification
- Python tests for clamping, downsampling, lap markers, gap derivation.
- Playwright screenshots: night + day, mid-race playback, tower gaps, speed strip,
  gap chart, missing-gap session, mobile.


## What shipped (verified)

- Session-scale replay: `GET /session/{info,geometry,replay,speed,gaps}`; the
  clock is zeroed at lights out and every frame is clamped to the session
  window (OpenF1 leaks pre/post-session rows).
- Robust lap clock: red-flag lap rows dropped (a 1711 s "lap 2" exists in Suzuka
  2024 data), markers forced monotonic, sequential display index (1..52) so
  source numbering gaps cannot confuse the UI.
- Gaps: live intervals with lap-time derivation as fallback, and an explicit
  source label in the session facts; missing values show "—", never zero.
- Speed: per-lap telemetry for chosen drivers with dash patterns for same-team
  colours; no data → plain sentence.
- Day/night: one token set each, toggle persisted, canvas re-reads CSS vars.
- Fixed: "1108 laps" → "Distance 53 laps"; "2:00:00 session" → "Race time
  1:26:08"; tower/added copy in sentence case; driver counts real.


## Pass 3 — fixes from user review

- **Loading with context**: switching year/GP/session clears the previous
  session's data and shows "Loading <GP> · <session>" instead of stale frames.
- **Lap windows** were unbounded (a 5.8 km lap measured 57 km, ≈10 laps) — they
  are now clamped by the measured lap duration, which also fixed outlines, DRS
  and corner geometry.
- **Corners**: detection rewritten to work on an arc-length-resampled path in
  fractions of lap length (source coordinates are not metres, and thresholding
  by sample index made results unstable). Suzuka: 18, COTA: 22 — matching the
  real circuit corner counts, labelled T1..Tn with a note that they are detected
  from telemetry, not official FIA numbering.
- **Player bar** moved below the map so it can never cover the circuit
  (Singapore-style layouts were the risk).
- **Tooltips**: every jargon term in the facts/panels has a dotted-underline
  explainer (gap, stint, degradation, pit loss, traffic on exit, radio, race
  control), keyboard-focusable.
- **Driver card**: click a car or tower row → full name, team, country, timing
  abbreviation explained, position, gap, tyre compound + age, last/best lap,
  laps run.
- **Map hover** shows position, gap, tyre and speed (not just speed).
- **Battle** rebuilt: two drivers, relative gap across the whole session, lap
  pace deltas you can click to seek, head-to-head stats.
- **Performance/Pit wall context**: scope toggle (my drivers vs whole field),
  driver codes instead of numbers, "whole race" vs replay-moment labels, stint
  axis, provenance line for the pit model inputs.
- **Session window** shown in the facts panel (UTC start–end plus race time).
- Selects use one proportional arrow instead of the browser default.
