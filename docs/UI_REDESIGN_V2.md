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


## Pass 4 — orientation, player placement, panel clarity

- **Circuit orientation** had two independent bugs: positions were drawn with
  canvas y-down while the world is y-up (a mirror), and `map_plane` picked axes
  by variance — for Monaco it returned (y, x) while the car dots always used
  (x, y), so dots and outline were in different projections. The plane is now
  fixed to (x, y), the canvas flips y, and the map is rotated so the start
  straight is horizontal (rotation returned by the API and applied to cars,
  corners and DRS zones alike). Numerically verified: car-to-outline distances
  are ~0.1% of track span on Monaco, Suzuka and COTA.
- **Player bar** is now a sibling of the map, not an overlay: measured
  non-overlap, so no circuit section can hide behind it.
- **Pit wall** rewritten around the question it answers: "Should X pit now or
  stay out for the last N laps?" → two totals as bars, the verdict, the saving
  in seconds, the three assumptions, and a provenance line of measured inputs.
- **Weather** is a full-session air/track temperature chart, not the last sample.
- **Degradation**: "Whole field" lists every stint (no silent 12-row cut);
  "My drivers" is empty (with a hint) until you actually pick drivers, instead
  of showing a rotating cast of three.
- **Radio / race control** show every event with counts and click-to-seek.
- **Per-driver loading**: while a driver's speed is in flight the panel shows a
  spinner naming the drivers, and tower gaps render dimmed until timing exists.


## Pass 5 — session availability + identity

- **"This session has no replay data"** had three separate causes:
  1. A transient feed failure surfaced as that sentence. Failures are now split:
     404 means the session truly has no positions; anything else says the feed
     did not answer and offers **Try again** (which forces a rebuild).
  2. A single driver's `/location` failing aborted the entire build; drivers
     are now fetched independently, and the response reports
     `drivers_included / drivers_expected`.
  3. Geometry picked the fastest lap of the session — which, in feeds that only
     cover part of the session (Monaco 2026), has no positions at all. It now
     prefers the fastest lap that is inside that driver's position coverage.
- **Race length can no longer shrink** because a feed stopped sending
  positions. Duration comes from the lap clock (bounded by the scheduled
  window); `positions_end_s` reports where positions stop, the timeline shades
  that stretch ("no car positions"), and a sentence explains that the map
  holds last known positions while lap times and gaps continue.
- OpenF1 emits `x=y=0` placeholders before a car has a position fix; they are
  dropped so cars no longer pile up at the origin.
- **Identity**: a real mark replaces the Vite default — three timing bars
  (dim / amber / ink) on the pit-wall charcoal tile, which reads at 16 px and
  echoes the delta bars in the UI. Shipped as SVG + 32/180/192/512 PNGs + a
  maskable variant, wired into `favicon`, `apple-touch-icon`, a web manifest
  (`application/manifest+json`) and the in-app header lockup.


## Pass 6 — replay actually plays

- **Geometry crashed on DRS zones**: `rotate_points` assumed `{x, y}` while zones
  are segments `{x0, y0, x1, y1}`, raising `KeyError: 'x'` → HTTP 500 → the map
  block (and the speed panel inside it) never rendered, so Play advanced the
  clock while the circuit stayed empty. Rotation now handles both shapes, with a
  regression test.
- **One failed request no longer blanks the whole replay**: loading depends on
  the replay payload only; a geometry failure renders the map area with an
  explanation while the player, timeline, corners, speed and gaps still work.
- **Speed telemetry is never empty**: with nothing picked, the panel follows one
  stable driver (the leader at lights out, named in the heading) instead of
  showing nothing or a set that changes every frame.
- Verified by pixel-hashing the canvases in a real browser: the map hash changes
  on every tick while playing, the speed chart has ink, session switches reset
  the clock to 0:00 and load the new session, and a page reload keeps the deep
  link.


## Pass 7 — persistent failures and stray trails

- **A cached empty replay made failures permanent.** `build_session_replay`
  wrote the parquet even when it had zero rows, so after one transient feed
  failure the session returned "no data" forever — reloading (with the same
  deep link) changed nothing. Empty results are no longer cached, cached files
  are revalidated, the cache filename is versioned (`session_pos_v2_*`), and a
  refresh clears every variant. A transient failure now also retries once
  automatically before the button is needed.
- **Trails pointed across the circuit.** The gap guard was written but never
  applied (a failed edit), and all 22 drivers drew trails at once. Trails are
  now drawn only for the drivers you follow, stop at telemetry gaps
  (`maxStep` = 5% of circuit span), and `posAt` holds the earlier sample rather
  than sliding a dot across a gap. Unit tests cover both.
- Session facts count drivers from the entry list, so a cancelled round no
  longer reads "0 drivers" while the tower lists 22.


## Pass 8 — smoothness, chart width, hover, stints, pit model

- **Playback stutter was the whole page re-rendering at 60 fps.** App subscribed
  to every playback tick, so 22 tower rows, gaps and panels re-rendered each
  frame. The page now ticks at ~8 Hz; the map, timeline and charts keep their
  own frame loop. Measured after the change: 230 frames, median 16.7 ms,
  p95 16.7 ms — a locked 60 fps.
- **Charts were drawn at a stale width** (measured once, never re-measured),
  which left "Relative gap" filling a quarter of its pane. A shared
  `useCanvasSize` hook with a ResizeObserver now sizes every chart to its
  container.
- **Hover on every chart**: speed (time + km/h per driver), gap to leader
  (time + gap per driver), relative gap (who is ahead and by how much),
  weather (air/track/humidity/rain), timeline (clock + lap under the cursor).
- **Stints are one row per driver** with stacked compound blocks, a compound
  legend and a stint count — no more three rows for a two-stop race.
- **Pit model numbers were wrong**: "current pace" came from the red-flag lap
  and "fresh pace" from out-laps. Current pace is now the median of green laps
  in the current stint; fresh pace is the median of laps 2-4 of each stint;
  wear is measured only on the current stint, and shown as "not measurable"
  when the stint is too short. The panel now states its question, the two
  totals, the verdict, a full breakdown table and what the model ignores.
- Battle "Head to head" gained tooltips (gap now = to the race leader, plus a
  "between them" row); the relative-gap axis labels were corrected.
