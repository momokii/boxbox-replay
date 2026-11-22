# BoxBox Replay

**Replay any Formula 1 race on a pit-wall timing screen — every driver on track, gaps counting down, and an engineer you can ask about any corner.**

Free, no account, no live-timing subscription. Data comes from public archives and is cached locally, so a race you have opened once works offline from your own machine.

![BoxBox Replay — race replay](docs/screenshots/01-replay.png)

<sub>Canadian Grand Prix 2026, lap 58. Timing tower on the left, circuit and playback in the middle, driver card with headshot and race engineer on the right.</sub>

> **Latest release: `v4.4.0` — the Grid race desk.** Explains the Grid model on setup, fills the qualifying card, adds a live driver desk with any-driver comparison, seeded SC/VSC/crash incidents, and a Top/Angle circuit view. It keeps the honest limits explicit: incidents are game events, not real race control, and Grid pace is not km/h. See [`docs/V4_4_CLOSEOUT.md`](docs/V4_4_CLOSEOUT.md), [`docs/V4_4_GRID_RACE_RESEARCH.md`](docs/V4_4_GRID_RACE_RESEARCH.md) and [`docs/V4_4_GRID_RACE_PLAN.md`](docs/V4_4_GRID_RACE_PLAN.md).

## What's new in v4.4

- **The Grid explains itself.** Setup now shows how a weekend works and the exact form calculation (58% driver points + 42% championship position; 64% driver + 36% team), plus the incident model and an explicit “not a prediction” statement.
- **Qualifying uses the whole card.** Pole, pole lap, player/AI and field size sit beside the live progress instead of leaving the right half blank; the card stacks on phones.
- **Driver desk and compare.** Click a car or tower row for live position, lap, gap, pace, last lap, race mode and team; choose any other driver for A/B position, gap and pace deltas. No fabricated km/h.
- **Seeded incidents.** SC/VSC add a stated lap-time loss; a crash retires a driver and classifies them DNF. The latest event appears as a race-control banner. Events are deterministic per seed, and an optional seed field makes the race reproducible.
- **Top / Angle circuit view.** The Grid circuit gets an illustrative angled view that shares track, marker, hover and click projection with the top view.
- **Screenshots and docs** refreshed for the explainer, qualifying facts, event banner, driver desk, angle view and mobile desk.

## What's new in v4.3

- **Five laps now mean five circuits.** The Grid canvas mapped `progress / laps`, compressing the whole race into one lap divided into five sectors. It now uses `progress % 1`; a lap-fraction regression test covers the mapping.
- **Qualifying is visibly different.** Setup uses an explicit **Run / Skip** choice. Run opens a live single-flying-lap session with revealing rows, a progress bar and a gated **Continue to grid**; Skip shows the explicit skipped-grid state.
- **The start button says what will happen:** **Run qualifying →** or **Set the seeded grid →**.
- **Grand Prix selection is preserved.** A late calendar response no longer snaps an explicitly chosen race back to round 1.
- **Hover is discoverable.** The race screen explains that hovering a car shows position, pace, gap and race mode. No fake km/h.
- **3D is unchanged** in this correction pass, as requested.

## What's new in v4.2

- **Qualifying is a real phase.** Checking “Run qualifying” now opens a single flying-lap session with pole, full order, gaps and player badges before the grid. Skipping still produces the same seeded grid, with an explicit skipped state.
- **Grid hover.** Hover a car for position, player/AI, current lap, simulated pace, gap and race mode (`Leading` / `Attacking` / `Defending` / `Clear air`). There is no fake km/h: Grid is a time model, so pace is the honest speed readout.
- **Lap strip.** The race header shows each lap and a filled progress strip; 1× is about 8 s/lap (5 laps ≈ 40 s) and the result waits for the full distance.
- **3D selected card.** Selecting a driver in 3D shows position, gap, tyre and the existing live speed feed in the 3D HUD.
- **Screenshots and docs** refreshed for qualifying, hover, lap strip and the 3D selected card.

## What's new in v4.1

- **Pit overlay, corrected.** The ambiguous recorded pit-transit path is gone. 2D and 3D show a short, solid, **schematic** pit lane beside the start/finish section; it is labelled and never presented as measured geometry.
- **3D Free/Overview.** Actual 3D cars stay in Follow. Overview and far Free views show car markers so the field is visible at true-circuit scale; Free close-up still shows the car. The duplicate-looking line is removed.
- **BoxBox Grid race, corrected.** No sideways marker offset; every car stays on the circuit at its actual lap progress. 1× is now roughly 8 seconds per lap (5 laps ≈ 40 s), with 2×/4× available. The stage scrolls to the top when the race starts.
- **No default/lap change.** The 5-lap default remains; the finish transition now waits for the simulated race distance.

## What's new in v4.0.0

- **3D replay, rebuilt.** True relative car/track proportions, a visible low-poly car, kerbs, a start/finish strip, a recorded (or explicitly schematic) pit-lane guide, a minimap and **Follow / Overview / Free** cameras. Overview uses car markers because a true-scale car is tiny at full-circuit distance; Follow shows the actual 3D car. Track width remains a stated visual constant because OpenF1 location has no lateral placement.
- **Cars leave the track when the data says so.** Final-result DNF/DNS/DSQ status is combined with the last recorded lap to compute an exit clock. The map and 3D hide a retired car from that moment; a “Not on track” rail keeps the status visible. The current 2026 Canada session has 5 DNFs and 1 DNS, all handled this way.
- **Pit and race control are visible.** A recorded pit transit is drawn as an approximate guide when the feed gives a usable short path; otherwise the app says “schematic”. Active pit transits get a ring on the 2D map. The latest race-control message appears under the replay, not as an invented corner marker.
- **BoxBox Grid.** Open it from the header or dashboard. Choose a 2023–2026 season, a real Grand Prix, 1–4 local players, 3/5/10 laps, and run or skip qualifying. The field comes from final Jolpica standings for completed seasons (current table for the latest); the circuit comes from OpenF1 geometry; the race is a deterministic local model (64% driver form + 36% team form + seeded variation), never a real-world prediction. One driver per person, no duplicates.

## What's new in v3.13

- **v3 close-out.** Security headers (CSP, nosniff, frame denial, referrer and permissions policy), removal of tracked coverage/dead scripts, a security policy, contribution guide and a final architecture/limitations document.
- **Verified latest build.** All v3 surfaces rechecked under the CSP; headshots, 3D, reports, downloads and mobile remain functional.

## What's new in v3.12

- **Hover speed on demand.** The map hover card no longer says “speed loading…” forever for a car that is not followed. It requests that driver’s speed once, caches it, and distinguishes loading from genuinely unavailable data.
- **No all-driver prefetch.** Only the hovered car is fetched, preserving the 30 req/min OpenF1 budget.

## What's new in v3.11

- **Replay loading progress.** A cold session needs one OpenF1 location request per driver; the free feed allows 30 requests/minute. The loading card now shows `N/total drivers · elapsed` and says why the first visit takes about a minute.
- **Switching cancels stale work.** Selecting another session cancels the previous replay build before it consumes more of the request budget; cached per-driver locations remain reusable. The second visit to a session is still instant.

## What's new in v3.10

- **Telemetry AI grounding fixed.** The explain request now uses the selected Replay/Fixed/Full window, so the narrative aggregates match the chart instead of describing a different (often empty) window.
- **Stint explanations.** Every summary (`stints`, `stops`, `best`, `overtakes/lost`) has a tooltip and a visible “how to read a row” definition. Best stop is stationary time, not pit-lane loss.
- **Session-wide download.** **Download data** is directly in the session header (also available inside Report). It exports Classification, Fastest laps, Laps, Stints, Weather, Race control, Radio, Pit stops and Overtake counts as CSV (opens in Excel) or a multi-table JSON bundle. Client-side, no new requests.
- **Session report.** A print-first A4 report with a closed circuit outline, key takeaways, summary cards, classification, tyre/pit table, fastest laps and a report glossary. **Data** shows measured tables only; **AI-enhanced** adds a three-part analysis (what decided it, tyres/pits, what the data cannot show) without changing the tables. **Print / Save PDF** is disabled while the analysis is generating; print CSS removes app chrome and no longer leaves blank lead pages. Pit visits are labelled separately from visits with a timed stationary stop. A feed with no timed stops shows an explicit empty state, not a blank table.

## What's new in v3.9.0

- **Battle snapshot, made real.** “Battles now”, gaps, pace and inputs freeze at the selected lap, while the relative-gap chart, pace rows and overtakes stop at that lap. The main replay clock and tower are explicitly unchanged; **Back to replay** restores the full history.
- **Driver headshots fixed.** Image ready/failed state is keyed by driver number + URL, so switching from one driver to another no longer hides the new photo behind the number fallback.
- **Share card rechecked.** The 1200×630 download places every car on the rotated circuit; labels are collision-limited and the footer stays clear.
- **Prior v3.8 features remain:** Telemetry replay/fixed/full-session windows, Detail/Overall mini-sectors, strategy recommendation banner.

| Championship standings | Results archive |
|---|---|
| ![Standings](docs/screenshots/29-standings.png) | ![Archive](docs/screenshots/31-archive.png) |

| 3D Follow | 3D Overview |
|---|---|
| ![3D Follow](docs/screenshots/50-3d-follow.png) | ![3D Overview](docs/screenshots/51-3d-overview.png) |

| 3D Free (field markers) | 3D day theme |
|---|---|
| ![3D Free](docs/screenshots/60-3d-free.png) | ![3D day](docs/screenshots/52-3d-day.png) |

| 3D on a phone | |
|---|---|
| ![3D mobile](docs/screenshots/58-3d-mobile.png) | |

| BoxBox Grid lobby | 2-player line-up |
|---|---|
| ![Grid lobby](docs/screenshots/53-grid-lobby.png) | ![Grid line-up](docs/screenshots/54-grid-lineup.png) |

| Grid qualifying | Grid race |
|---|---|
| ![Grid qualifying](docs/screenshots/55-grid-qualifying.png) | ![Grid race](docs/screenshots/56-grid-race.png) |

| Grid hover | 3D selected driver |
|---|---|
| ![Grid hover](docs/screenshots/62-grid-hover.png) | ![3D selected driver](docs/screenshots/61-3d-selected.png) |

| Grid result | Skipped qualifying |
|---|---|
| ![Grid result](docs/screenshots/57-grid-result.png) | ![Grid skipped](docs/screenshots/63-grid-skip.png) |

| Grid explainer | Grid race-control event |
|---|---|
| ![Grid explainer](docs/screenshots/64-grid-how.png) | ![Grid VSC](docs/screenshots/65-grid-event.png) |

| Grid driver desk | Grid angle view |
|---|---|
| ![Grid driver desk](docs/screenshots/67-grid-driver-desk.png) | ![Grid angle](docs/screenshots/66-grid-angle.png) |

| Grid on a phone | Mobile driver desk |
|---|---|
| ![Grid mobile](docs/screenshots/59-grid-mobile.png) | ![Grid mobile desk](docs/screenshots/69-grid-mobile-desk.png) |

| Duel inputs (v3.7) | Battle inputs (v3.7) |
|---|---|
| ![Duel inputs](docs/screenshots/35-duel-inputs.png) | ![Battle inputs](docs/screenshots/36-battle-inputs.png) |

## What it does

- **Dashboard with continue-list.** No forced session: a landing page shows the sessions you opened recently (stored on this device, filterable, removable one by one or cleared), a random “Surprise me” picker, how the app works, and a **BoxBox Grid** entry point.
- **Full-field replay.** All 20+ cars on the circuit at once, moving on the real session clock (lights out to chequered flag). Play, pause, 1×–8×, scrub, or press Space.
- **Timing tower.** Classification order with live gaps, position numbers, and retired cars marked DNF/OUT instead of showing a stale gap.
- **Track map.** Circuit drawn from the session's own telemetry, with corners detected from curvature and DRS zones read from the cars' DRS state.
- **BoxBox Grid (v4.4).** A full-screen local race room: real season standings, real circuit shape, 1–4 players, one driver each, 3/5/10 laps, a live single-flying-lap qualifying phase or explicit skipped grid, seeded race, player badges and result. Setup explains the model and its arithmetic. Hover a car for position, player/AI, lap, pace, gap and race mode (leading/attacking/defending/clear air); click a car or tower row for a live driver desk and A/B comparison. Pace is the honest readout, not a fake km/h. Seeded SC/VSC/crash events interrupt the race with a banner; crashes classify a driver DNF. Every lap crosses the whole circuit (`progress % 1`), 1× is about 8 s/lap with a lap strip, and 2×/4× remain. The model does not simulate tyres, pit stops, collision physics or reliability; incidents are game events, not real race control.
- **Replay truth (v4).** Retirements are timed from the final result plus last-lap evidence; DNF/DNS/DSQ cars are hidden from that clock and listed in a status rail. The latest race-control message is shown as text. No collision marker is invented.
- **Battle view.** A live **Battles now** strip lists neighbouring drivers within 1 s at the current frame (click to compare), plus an anchor and up to two challengers: relative gap over the whole session, lap-by-lap pace deltas, pairwise head-to-head, and the overtakes between them.
- **Performance.** Stint timeline with pit-stop notches (hover for compound, tyre age and the gap at the stint start), wear per stint grouped by driver, lap-time evolution, weather over the race, team radio (audio links), and the full race-control log with search and filters. Summary definitions: a **stint** is one continuous tyre run; a **stop** is a recorded pit visit; **best stop** is the fastest stationary time (not full pit-lane loss); **overtakes made/lost** are timing-feed counts and may be incomplete.
- **Driver drill-down.** Click any car or tower row for position, gap, tyre age, result, a five-lap strip, pit stops, overtakes — each opening a full view.
- **Lap times.** Sortable by time or sector (fastest first), filterable by driver, and comparable across any number of drivers.
- **Qualifying mini-sectors (v3).** Real segment strips (green/purple/yellow) for qualifying and practice, with placeholder detection; races show nothing rather than fake segments.
- **Pit crews & overtakes (v3).** Stop-time distribution, median/best, outlier flags and the most overtakes, from the cached feeds, with definitions for timed stops, stationary time vs pit-lane loss, and incomplete overtake counts. The report distinguishes **pit visits** from visits with a timed stationary stop.
- **Championship standings (v3.6+).** A Standings tab resolves the current weekend to its championship round and shows the driver/team table plus a selectable points-by-round chart, per-round tooltips and a head-to-head table. Source: Jolpica F1 (CC BY-NC-SA 4.0), attributed in the panel; the archive is revalidated hourly and can be refreshed on demand.
- **Results archive (v3.6+).** A separate, full-screen archive for every Jolpica season through 2026: season → race → result, with standings beside it. Results and standings only — replay telemetry starts in 2023. Season/race changes show explicit loading states; missing and future rounds have honest fallbacks.
- **Session data download (v3.10).** Dedicated modal for the available session tables, CSV or JSON, generated entirely in the browser.
- **Printable report (v3.10).** Data and AI-enhanced A4 report with a circuit outline, summary cards, classification, tyre summary and fastest laps; print CSS removes the app chrome.
- **Selectable windows (v3.8/9).** Telemetry holds a replay lap, a fixed lap or the full session; Battle freezes at a lap snapshot, truncates its history charts to that lap, and returns to replay. Mini-sectors switch between per-tick detail and per-sector overall.
- **Driver headshots (v3.8).** OpenF1's `headshot_url` is shown with a number fallback; the image is not rehosted.
- **Duel and Battle comparisons (v3.7).** Duel overlays both full lap traces and compares throttle/brake/gear/DRS at the same lap progress; Battle adds point-in-time inputs for the anchor and challengers.
- **3D replay (v4.3).** A `2D · 3D` switch on the Replay map; 3D is a lazy-loaded perspective view of the same cars and clock. **Follow** tracks the selected/leading car, **Overview** fits the true-scale circuit with car markers, and **Free** enables orbit/zoom with markers at far distance and the car at close range. Selecting a driver adds a compact HUD card for position, gap, tyre and live speed. The car is 5.6 m against a 12 m visual track width; OpenF1 does not publish a metric width or lateral position, so the width is a constant and the pit guide is a labelled schematic. 2D stays the default and owns corners, DRS and hover.
- **Telemetry lab (v3).** Up to three drivers on the same clock: speed traces, throttle/brake/gear/DRS at the cursor, and explicit nulls when a channel is missing. Distance-aligned lap comparison stays in Lap duel.
- **Driver inputs.** Throttle, brake, gear and DRS for the lap under the playhead, overlaid for every followed driver, with a hover readout at any point on the trace; missing channels print "—" instead of a guess.
- **Lap duel.** Two laps race the same circuit, aligned by distance around the lap, with a live delta that starts at 0.000 and closes exactly on the official lap-time difference.
- **Strategy model (v3).** A transparent stay-vs-pit model over clean laps, stints and measured pit-lane times: ranked options, break-even pit loss, an undercut estimate, coverage/exclusions and every assumption. The v2 toy remains in Pit Wall for comparison.
- **Pit strategy toy model.** "Pit now or stay out?" using measured pace and wear, with the arithmetic shown step by step, a **break-even pit loss**, the assumptions, and an **Explain this call** button that names exactly what the engineer receives and will not recalculate.
- **Ask the race engineer (chat).** A bordered chat panel with a pinned composer and two-sided bubbles (you on the right, the engineer on the left): follow-ups keep the thread, prompt chips stay one click away, the transcript scrolls (with a “Newest” jump when you read back), long questions wrap, and Clear chat wipes the tab-local history. It adapts to the session — race prompts and a race recap for races, pole/gap prompts and a qualifying recap for qualifying, fastest-lap/team prompts for practice. Answers use full driver names and every session fact (full classification, retirements, sector and ideal-lap references, pace, pit stops, tyre plans, overtakes, weather, race control), stay in the app's voice, and decline off-topic questions. The API key stays on the server.
- **Shareable moments.** "Copy link" stores the exact timestamp, so a link reopens the same frame.
- **Layouts and offline (v3).** Full / Focus / Data layouts; **Save offline** caches the current session (max 25 MB) and the installed PWA replays it with the network off. AI is disabled offline and says so.
- **Weather & race-control timeline (v3).** VSC/SC bands, flag markers and the track-temperature trace on one session clock, with counts and hover detail; descriptive only.
- **Data export.** Laps and stints as CSV, generated client-side from the loaded session; no new requests, no secrets.
- **Share card.** One click downloads a 1200×630 PNG of the current frame — circuit, every car, lap and clock — for a post or a message.
- **Dark and light themes**, keyboard shortcuts, reduced-motion support, and a layout that stacks on phones.

| Battle | Performance |
|---|---|
| ![Battle](docs/screenshots/03-battle.png) | ![Performance](docs/screenshots/04-performance.png) |

| Pit wall | Lap times (full view) |
|---|---|
| ![Pit wall](docs/screenshots/05-pit-wall.png) | ![Lap times](docs/screenshots/06-lap-times.png) |

| Lap duel | Driver inputs |
|---|---|
| ![Lap duel](docs/screenshots/08-duel.png) | ![Inputs](docs/screenshots/09-inputs.png) |

| Ask the race engineer | Dashboard |
|---|---|
| ![Ask](docs/screenshots/10-ask.png) | ![Dashboard](docs/screenshots/11-dashboard.png) |

| Light theme | |
|---|---|
| ![Light theme](docs/screenshots/02-replay-light.png) | |

| Phone | |
|---|---|
| ![Mobile](docs/screenshots/07-mobile.png) | |

## Architecture

```
                 browser (React SPA, TypeScript, hand-drawn canvas)
                ┌───────────────────────────────────────────────────┐
                │ map · timeline · charts · chat · pit wall         │
                └───────────────▲───────────────────────────────────┘
                                │  JSON over /api (same origin)
                ┌───────────────┴───────────────────────────────────┐
                │ nginx (serves the built SPA, proxies /api)        │
                └───────────────▲───────────────────────────────────┘
                                │
                ┌───────────────┴───────────────────────────────────┐
                │ FastAPI (api/main.py)                             │
                │  serialises DataFrames → JSON, clamps windows,    │
                │  session/chat/pit endpoints, session-aware facts  │
                └───────┬───────────────────────────────┬───────────┘
                        │                               │
        ┌───────────────┴──────────────┐   ┌────────────┴─────────────┐
        │ analysis.py (pure functions) │   │ ai.py · coach.py         │
        │ corners, deltas, wear, model │   │ grounded AI answers;     │
        │                              │   │ corner coach + fallback  │
        └───────────────▲──────────────┘   └────────────┬─────────────┘
                        │                               │
                ┌───────┴───────────────────────────────▼───────────┐
                │ data_loader.py · ratelimit.py                     │
                │ 3/s + 30/min bucket · retry · session clamp       │
                │ parquet cache in ./data/cache                     │
                └───────▲───────────────────────────────▲───────────┘
                        │                               │
                ┌───────┴────────┐              ┌───────┴────────────┐
                │ OpenF1         │              │ OpenCode Go (AI)   │
                │ sessions, laps │              │ optional, keyed    │
                │ location, car… │              │ chat/recap/pit     │
                └────────────────┘              └────────────────────┘
```

**How a replay is built.** Selecting a session triggers three stages: the lap
clock (so the timeline, `LAP x/y` and gaps work immediately), the circuit
geometry from one representative lap, then positions for every driver (streamed
in, so cars appear progressively). Car telemetry for the drivers you follow is
fetched on demand. Everything is cached as parquet keyed by session, so the
first visit to a race takes about a minute and every visit after that is instant.

**Playback model.** One shared store owns the clock. The map, timeline and charts
subscribe to it directly and redraw on the animation frame; the heavier page
around them re-renders at ~8 Hz, which keeps playback at 60 fps.

**Honesty rules baked into the code.** Numbers come from the feeds or are
computed from them; when a feed is missing the UI says so and hides the block
rather than inventing a value. Retired cars are classified last. The tower is
ordered by classification gap (what a timing screen shows), not by physical
track order. The pit model prints its inputs and its assumptions.

**How a visit works.** The landing dashboard offers your recently opened
sessions and a random picker; choosing one loads the replay, tower and panels.
A session can be a race, qualifying or practice, and the Ask tab adapts its
prompts, recap and facts to that session type. AI features are optional: without
`OPENCODE_API_KEY` the chat and pit explanation say they are disabled; every
other panel still works.

**Credentials.** OpenF1 needs no account or key. The only optional credential is
`OPENCODE_API_KEY` (OpenCode Go) for the AI answers; it stays on the server and
in `.env`. See [`.env.example`](.env.example).

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · UI decisions in
[`docs/UI_REDESIGN_V2.md`](docs/UI_REDESIGN_V2.md) · data-source research in
[`docs/UI_RESEARCH.md`](docs/UI_RESEARCH.md).

## Run it

### Docker (recommended)

```bash
cp .env.example .env          # optional: defaults work without it
./scripts/setup.sh            # builds api + web, serves http://localhost:8501
./scripts/setup.sh --prod     # production stack (asks for confirmation)
```

The stack is two containers: `api` (FastAPI, internal port 8000) and `web`
(nginx serving the SPA and proxying `/api`). The dev override hot-reloads the API
and bind-mounts the source; the prod override adds restart policies, resource
limits and `no-new-privileges`.

### Local development

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn api.main:app --reload --port 8000     # API

cd web && npm install && npm run dev                    # SPA on :5173, proxies /api
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `staging` or `production`; unknown values are treated as production for safety |
| `APP_PORT` | `8501` | Host port for the web container |
| `OPENF1_BASE_URL` | `https://api.openf1.org/v1` | Data feed base URL |
| `OPENF1_API_KEY` | empty | Only needed if the feed starts requiring credentials; sent as Bearer and `api_key` |
| `OPENF1_RATE_PER_SEC` | `3` | Request budget, part 1. Raise to `6` only on the sponsor tier |
| `OPENF1_RATE_PER_MIN` | `30` | Request budget, part 2: rolling 60 s window |
| `OPENCODE_BASE_URL` | `https://opencode.ai/inference/go/openai/v1` | OpenAI-compatible AI endpoint (OpenCode Go) |
| `OPENCODE_API_KEY` | empty | AI key; server-only, never exposed to the browser |
| `OPENCODE_MODEL` | `deepseek-v4.1-flash` | Model id used for answers |
| `AI_MAX_TOKENS` | `1200` | Answer budget (reasoning tokens count) |
| `AI_RATE_PER_MIN` | `6` | Server-side AI budget |
| `JOLPICA_BASE_URL` | `https://api.jolpi.ca/ergast/f1` | Archive/standings base URL |
| `JOLPICA_CACHE_TTL` | `3600` | Seconds before an archive response is refetched |
| `JOLPICA_RATE_PER_SEC` / `_PER_HOUR` | `4` / `500` | Jolpica free-tier budget |
| `CACHE_DIR` | `data/cache` | Where OpenF1 parquet and Jolpica JSON caches live |

Every variable is documented with a placeholder in [`.env.example`](.env.example).
`.env` is gitignored; never commit real values.

## API

| Endpoint | Returns |
|---|---|
| `GET /years` | Seasons with data |
| `GET /meetings?year=` | Grands Prix for a season |
| `GET /sessions?year=&meeting_key=` | Sessions for a meeting |
| `GET /sessions/status?keys=` | Telemetry availability per session |
| `GET /drivers?session_key=` | Entry list |
| `GET /session/info` | Session clock, race distance, entry count |
| `GET /session/geometry` | Circuit outline, corners, DRS zones, rotation |
| `GET /session/replay` | Every driver's positions, sampled; lap markers |
| `GET /session/replay/status?session_key=` | Local build progress: state, drivers done, elapsed |
| `POST /session/replay/cancel?session_key=` | Cancel a superseded cold build |
| `GET /session/gaps` | Gaps to leader (live intervals, else derived from lap times) |
| `GET /session/speed?driver_number=` | One driver's speed for the session |
| `GET /session/duel?a_driver=&a_lap=&b_driver=&b_lap=` | Two laps aligned by distance: traces plus the time delta at equal progress |
| `GET /session/inputs?t0=&t1=` | Throttle, brake, gear and DRS over a session-time window |
| `POST /session/strategy` | Ranked stay/pit options with assumptions and coverage |
| `POST /session/telemetry` | Up to five drivers on one clock; null channels preserved |
| `GET /session/timeline` | Weather and race-control events on the replay clock |
| `GET /standings?year=&round=&refresh=1` | Driver/team standings after a round (Jolpica); refresh bypasses the cache |
| `GET /standings/progression?year=&round=&refresh=1` | Points after each round, with race context |
| `GET /archive/seasons` · `/archive/{year}/races` · `/archive/{year}/{round}/results` | Results/standings archive through the latest season (Jolpica) |
| `GET /ai/status` | Whether AI is configured and which model is used |
| `POST /ai/chat` | Multi-turn grounded chat (bounded history) |
| `POST /ai/recap` | Session recap in the session's own terms |
| `POST /ai/pit` | Explains a computed pit call; never recalculates it |
| `GET /session/pit` · `/overtakes` · `/result` · `/positions` | Stops, passes, classification, official order |
| `GET /laps`, `/stints`, `/weather`, `/radio`, `/race-control` | Session feeds |
| `POST /corner-loss` | Measured time lost at a corner vs a reference lap |
| `POST /coach/ask` | Grounded engineer answer (or an honest "unavailable") |
| `POST /pit-call` | Toy pit-strategy comparison |

`GET /api/healthz` is the health probe. Full shapes are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#api).

## Quality gates

```bash
pytest                       # 93 Python tests, all HTTP mocked
ruff check .                 # lint
cd web && npm test           # 97 frontend tests (vitest)
cd web && npm run build      # tsc type check + bundle
docker compose build         # image build
```

CI runs both stacks on every push — `ruff`, `pytest`, `npm test`, `tsc`, `oxlint`
and `vite build` — plus a secret scan (gitleaks), dependency audits (`pip-audit`,
`npm audit`) and an advisory container scan (Trivy). See
`.github/workflows/ci.yml`. Containers run as a non-root user with
`no-new-privileges` in production.

## Project layout

```
api/main.py          FastAPI: endpoints, JSON serialisation, AI facts
data_loader.py       OpenF1 client: fetch, retry, clamp, parquet cache
ratelimit.py         Sliding-window request budget (3/s + 30/min)
analysis.py          Pure math: corners, deltas, wear, positions, pit model, duels
ai.py                OpenCode Go client: chat, recap, pit explainer, scope guard
coach.py             Corner-coach prompt + measured fallback
web/src/game.ts      Pure seeded BoxBox Grid engine (ratings, quali, race)
web/src/pitlane.ts   Schematic pit guide + pit-window helper
web/src/retirements.ts  DNF/DNS/DSQ -> replay exit clocks
web/src/             React SPA: api client, playback store, canvas map,
                     charts, chat, dashboard, panels, modals,
                     game engine + BoxBox Grid view
tests/               pytest suites (pure maths, API contracts, cache, AI)
docs/                Architecture, deployment, testing, design notes, screenshots
scripts/setup.sh     One-command dev/prod stack
Dockerfile           API image (non-root, healthcheck)
web/Dockerfile       Multi-stage SPA build → nginx
compose*.yaml        base / dev override / prod override
```

## Data sources and limits

- **[OpenF1](https://openf1.org)** — sessions, laps, positions, car telemetry,
  intervals, stints, weather, radio, race control, pit stops, overtakes,
  results. Anonymous access is rate-limited; this app enforces both documented
  limits (3 req/s and 30 req/min) with one bucket, single-flights concurrent
  builds, and caches every response to disk.
- **[OpenCode Go](https://opencode.ai/docs/go/)** — optional AI answers in the
  Ask tab and pit-wall explainer (a paid subscription; the key stays server-side).

Known limitations, stated plainly:

- **First open of a race takes ~1 minute** (dozens of telemetry requests), then
  it is served from cache. Popular sessions can be pre-warmed by opening them.
- **AI quota.** OpenCode Go has a monthly allowance; when it runs out the AI returns a clear "usage limit reached" message (HTTP 429) and every non-AI panel keeps working.
- **OpenF1 availability.** If the feed rate-limits or blocks a client, uncached
  sessions show a clear message and cached ones keep working. If it begins
  requiring credentials, set `OPENF1_API_KEY`.
- **Corners are detected**, not official: labels T1…Tn come from curvature, so
  they are indicative rather than FIA numbering.
- **The pit model is a toy**, and says so: linear wear, static rivals, a pit
  loss you choose.
- **3D is not a metrically measured circuit.** OpenF1 location is approximate
  with no lateral placement; the ribbon width is a visual constant and the pit
  guide is explicitly schematic.
- **BoxBox Grid is a game model, not a prediction.** It uses final/current
  standings and a seeded model; it does not simulate tyres, pit stops,
  collision physics or reliability. SC/VSC are stated lap-time losses and a
  crash is a seeded retirement, not a reconstruction of real race control.
  Hover shows pace, not a fabricated km/h speed. Pre-2023 circuits are not in
  the game.
- **Retirement clocks are last-lap evidence**, not an official retirement
  timestamp; the feed does not provide one.
- **No live timing.** Historical sessions only (a day behind at the earliest),
  because OpenF1's live window is paid.

This project is not affiliated with Formula 1, the FIA or any team. OpenF1 is an
unofficial community API.

## Contributing

Issues and pull requests are welcome. Please run the quality gates above before
opening a PR, keep commits focused, and follow the honesty rule: never fabricate
a number the feeds do not provide — show an empty state instead.

## License

[MIT](LICENSE) © 2026 Kelana Chandra Helyandika — use it, fork it, learn from it.
Data belongs to its sources; see the credits above.

## Close-out documentation

- **v4.4:** [`docs/V4_4_CLOSEOUT.md`](docs/V4_4_CLOSEOUT.md), [`docs/V4_4_GRID_RACE_RESEARCH.md`](docs/V4_4_GRID_RACE_RESEARCH.md), [`docs/V4_4_GRID_RACE_PLAN.md`](docs/V4_4_GRID_RACE_PLAN.md)
- **v4.3:** [`docs/V4_3_CLOSEOUT.md`](docs/V4_3_CLOSEOUT.md), [`docs/V4_3_GRID_LAP_RESEARCH.md`](docs/V4_3_GRID_LAP_RESEARCH.md), [`docs/V4_3_GRID_LAP_PLAN.md`](docs/V4_3_GRID_LAP_PLAN.md)
- **v4.2:** [`docs/V4_2_CLOSEOUT.md`](docs/V4_2_CLOSEOUT.md), [`docs/V4_2_GRID_UX_RESEARCH.md`](docs/V4_2_GRID_UX_RESEARCH.md), [`docs/V4_2_GRID_UX_PLAN.md`](docs/V4_2_GRID_UX_PLAN.md)
- **v4.1:** [`docs/V4_1_CLOSEOUT.md`](docs/V4_1_CLOSEOUT.md), [`docs/V4_1_UI_FIX_RESEARCH.md`](docs/V4_1_UI_FIX_RESEARCH.md), [`docs/V4_1_UI_FIX_PLAN.md`](docs/V4_1_UI_FIX_PLAN.md)
- **v4:** [`docs/V4_CLOSEOUT.md`](docs/V4_CLOSEOUT.md), [`docs/V4_RESEARCH.md`](docs/V4_RESEARCH.md), [`docs/V4_PLAN.md`](docs/V4_PLAN.md)
- **v3:** [`docs/V3_CLOSEOUT.md`](docs/V3_CLOSEOUT.md)
- **Operations:** [`SECURITY.md`](SECURITY.md), [`CONTRIBUTING.md`](CONTRIBUTING.md)
