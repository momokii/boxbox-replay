# BoxBox Replay — v3 research and scope

Researched 2026-11-14. Licence, limit and pricing claims below were read from
the owning primary sources on this date (cited in §10). Payload/behaviour
numbers that were measured for v2 are carried forward and called out as such.

## TL;DR

- **v2 is shipped and tagged (`v2.13.1`):** replay, lap duel, inputs, pit wall
  (toy), grounded AI Ask/recap, Battles now, share card, dashboard. 67 Python +
  53 frontend tests, CI green, historical-only, OpenF1-backed.
- **The free data floor is unchanged.** OpenF1 historical (2023+, no auth,
  non-commercial) remains the primary source. Jolpica-F1 (Ergast successor,
  1950+, CC BY-NC-SA, 4/s + 500/h) adds long-history results but brings a
  share-alike licence and a different granularity (no telemetry pre-2023).
  FastF1 is no longer a free telemetry path: as of 3.9.0 it requires an F1TV
  Access/Pro/Premium subscription for most features.
- **Live timing is still a paywall, not a feature gap.** OpenF1 gates live data
  behind the €9.90/month sponsor tier (3 s delay, REST/MQTT/WebSocket, 6/s +
  60/min). Official F1 timing apps (F1 TV, MultiViewer) require F1TV
  subscriptions. v3 should stay historical-first unless a paid path is an
  explicit choice.
- **Recommended v3 headline:** a **strategy engine that earns the word "model"**
  (compound-aware degradation, optional fuel adjustment off by default,
  undercut/overcut and safety-car what-ifs), **Telemetry Lab 2.0** (multi-driver traces, corner deltas,
  qualifying mini-sectors where segments exist), and **AI race engineer 2.0**
  (key-moment narration and strategy explanations grounded in the same facts the
  UI shows). A **3D/WebGL track replay** is the visual stretch headline if
  performance holds.

---

## 1. What v2 is (baseline)

Verified in this repo at `9c3407a` / `v2.13.1`:

- Session dashboard with continue-list and random picker; no forced auto-open.
- Full-field replay on the session clock (map, timing tower, gaps, 1×–8×, scrub).
- Track map drawn from session telemetry with curvature-detected corners and
  DRS zones read from car state.
- Battle view: live "Battles now" strip (neighbours within 1.0 s at the frame)
  plus anchor/challenger comparison, lap deltas, head-to-head, overtakes.
- Lap duel: two laps aligned by distance; delta starts at 0.000 and closes on
  the official lap-time difference.
- Driver inputs: throttle/brake/gear/DRS overlays with hover readout.
- Performance: stint timeline (hover: compound, tyre age, gap at stint start),
  wear per stint, lap-time evolution, weather, team radio links, race control.
- Pit strategy toy model: stay-vs-pit with arithmetic, break-even pit loss,
  traffic penalty, assumptions printed; AI explains but never recalculates.
- Ask the race engineer: grounded chat/recap, session-aware (race/quali/
  practice), server-side OpenCode Go key, bounded history.
- Share: timestamp links (`?t=`) and 1200×630 share card PNG.
- Honest limits: historical only (~1 min cold open), corners indicative, pit
  model is a toy, AI can err, DRS/segments may be missing.

Key deliberate non-builds carried forward: historical Fight Finder (intervals
produced 181–593 noisy runs; position feed too sparse), qualifying mini-sector
strips (segments exist only outside races in OpenF1 — a constraint, not a
choice).

---

## 2. Data source audit

| Source | What it provides | Free? | Limits / auth | Licence / terms | Verdict |
|---|---|---|---|---|---|
| [OpenF1](https://openf1.org/) ([docs](https://openf1.org/docs), [GitHub](https://github.com/br-g/openf1)) | 18 endpoints: `car_data` (~3.7 Hz speed/rpm/gear/throttle/brake/drs), `location` (x/y/z, driver-filter mandatory), `laps` (durations, sectors, speed traps, `segments_sector_*`), `intervals`, `position`, `stints`, `pit`, `weather`, `race_control`, `team_radio`, `overtakes`, `session_result`, `starting_grid`, `meetings`, `sessions`, `drivers`, `championship_drivers` (beta), `championship_teams` (beta). Historical since 2023. | Yes, historical, no auth | **3 req/s and 30 req/min** (free). Sponsor €9.90/mo: live ~3 s delay, REST/MQTT/WebSocket, 6/s + 60/min. JSON/CSV. | Footer/docs: **CC BY-NC-SA 4.0**, non-commercial (education, personal projects, fan engagement). Unofficial; not affiliated with F1/FIA. | **Keep — primary source.** Already rate-limited and cached in app. |
| [Jolpica-F1](https://jolpica-f1.com/) ([docs](https://api.jolpi.ca/docs/), [GitHub](https://github.com/jolpica/jolpica-f1), [rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md), [terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)) | Ergast-compatible API: circuits, constructors, drivers, standings, results, qualifying, sprint, laps, pit stops, races, seasons, status (1950+). New alpha endpoints: schedules, results by round, core tables (laps/pit stops/sessions/entries), and [database dumps](https://github.com/jolpica/jolpica-f1/blob/main/docs/database_dumps.md) (CSV; delayed free/non-commercial, latest for supporters). | Yes, unauthenticated tier | **4 req/s burst, 500 req/h sustained**, per IP. Custom User-Agent required. | Code: Apache-2.0. **Data/terms: CC BY-NC-SA 4.0, non-commercial.** Commercial use requires contact; dumps have tiered access. | **Optional secondary source** for 1950+ results/standings/laps/pit stops. No telemetry. Share-alike means derivative datasets must be careful; displaying/caching for a non-commercial app is consistent with terms, but redistribution/licence mixing needs review. |
| [FastF1](https://docs.fastf1.dev/) ([auth](https://docs.fastf1.dev/api_reference/accounts_auth.html), [GitHub](https://github.com/theOehrly/Fast-F1)) | Python analysis of timing, telemetry, position, tyre/weather, schedules, results; Jolpica/Ergast integration; matplotlib helpers; caching. | **No for most features** | Since v3.9.0: **requires F1TV Access/Pro/Premium subscription** and account auth for most features. | Library: MIT (repo). Underlying F1 timing data is F1 content/licensed; not a free data grant. | **Not a v3 data source.** Useful as algorithmic reference (resampling, track map/circuit info helpers) only; do not depend on it at runtime without F1TV credentials. |
| OpenF1 `meetings.circuit_info_url` → [MultiViewer circuit data](https://api.multiviewer.app/) (surfaced via [FastF1 CircuitInfo](https://docs.fastf1.dev/api_reference/circuit_info.html)) | Corners, marshal lights/sectors, rotation (manually created, "not highly accurate but sufficient for visualization"; provided by MultiViewer to FastF1). Referenced per-meeting by OpenF1. | Endpoint publicly reachable via OpenF1 link | No documented public SLA; availability follows MultiViewer | MultiViewer provides data to FastF1; terms/redistribution of raw endpoint not stated in docs fetched. Treat as "use if available, degrade gracefully". | **Useful polish source** for track outlines/labels/rotation if permitted; not a hard dependency. |
| [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) | Static GeoJSON circuit outlines, 40 circuits | Yes (git) | None | **MIT** | **Optional polish** for outline/preview; must be transformed to match telemetry coordinates. |
| Official F1 timing / F1 TV / F1 API | Live timing, onboard, team radio, full telemetry, archive/replays | No | F1 TV subscriptions (Access/Pro/Premium; US integration via Apple TV). Live timing API is unofficial to third parties; apps like MultiViewer require F1TV auth. | F1/FIA content rights | **Exclude for free v3.** Paid/credentialed option only. |
| F1 team radio audio | OpenF1 `team_radio` links to F1-hosted clips; 2026 sessions often have no radio (per OpenF1 docs) | Links free | n/a | Audio is F1 content | **Keep links; exclude transcription/playback guarantees.** |

**v2 carry-over (measured, 2023–2026):** cold build ~30+ requests per session;
`location` requires a `driver_number` filter (20 requests for a full field); at
30 req/min the cold open is ≥~60 s and rate-limit bound. The app now enforces
3/s + 30/min with single-flight. `laps.segments_sector_*` are not usable in
races (mostly yellow placeholders) but can be meaningful in qualifying/practice
outside races.

---

## 3. Competitor and feature landscape (verified 2026-11-14)

| Project / app | Type | Notable capabilities | Data / notes |
|---|---|---|---|
| [FastF1](https://docs.fastf1.dev/) | OSS Python library (MIT) | Lap timing, telemetry, position, tyre/weather, schedules, results; pandas-first; plotting; caching; Jolpica support. Ecosystem standard. | Now requires F1TV auth for most features; unofficial. |
| [GP Tempo](https://www.gp-tempo.com/) | Web app | Lap telemetry comparison, sector times, track domination (listed by FastF1 as third-party site). | Public feature detail limited without JS; telemetry-focused. |
| [Armchair Strategist](https://armchair-strategist.dev/) ([GitHub](https://github.com/Casper-Guo/Armchair-Strategist), Apache-2.0) | OSS strategy dashboard | Strategy barplots, position changes, fuel-adjusted lap times, teammate/driver/compound pace, DLRT (delta to lap representative time), compound degradation distributions. Races since 2018. | Built on FastF1; data/compute assumptions explicit (caveats shown). |
| [F1 Telemetry (f1data.org)](https://www.f1data.org/tutorial) | Web app | Track map (GPS-derived, replay, live), qualifying compare, telemetry overlay, race pace, tyre degradation (fuel-corrected), strategy, weather impact, session compare, driver/team reports, championship, head-to-head history, session summary, race control, team radio. Live sessions ~3 s delay; simulated mode. | Uses OpenF1 (2023+); notes OpenF1 free access restricted during live sessions for some cases. |
| [f1-dash](https://github.com/slowlydev/f1-dash) | OSS dashboard (Next.js) | Real-time leaderboard, tyres, gaps, laps, mini-sectors. | Listed in awesome-f1; live-timing oriented. |
| [MultiViewer](https://multiviewer.app/) | Desktop app | Synced F1TV streams, live timing, track map, onboard, telemetry widgets, replays. | Requires F1TV subscription; unofficial. Provides circuit data used by FastF1. |
| [F1 TV](https://www.formula1.com/en/page/what-is-f1-tv-pro) | Official product | Live sessions, onboard (all drivers), team radio, live timing/telemetry, replays, archives, F2/F3/Academy. | Paid/licensed; regional availability. |
| Strategy/sim OSS (GitHub) | e.g. [TUMFTM/race-simulation](https://github.com/TUMFTM/race-simulation) (LGPL-3.0), [Bhooorya/f1-pit-strategy-optimizer](https://github.com/Bhooorya/f1-pit-strategy-optimizer) (MIT), [yuvanbruh/F1-Race-Strategy-Engine](https://github.com/yuvanbruh/F1-Race-Strategy-Engine), others | Pit-stop optimisation, tyre degradation models, fuel effects, Monte Carlo/what-if, undercut/overcut, strategy search. | Method references; data inputs vary (FastF1/telemetry/csv). |
| [awesome-f1](https://github.com/subinium/awesome-f1) | Curated list | Broad index of APIs, datasets, dashboards, live timing, fantasy, sim tools. | Good discovery source; verify each project individually. |

**What BoxBox does differently:** no account, historical-first, local cache,
hand-drawn canvas replay, honest toy-model labelling, grounded AI with
server-side key and session-aware facts, and a single-command Docker deploy.
v3 should deepen that identity rather than chase paid live features.

**2026 regulation context (relevant to data/UX, not to this repo's code):**
active aero (replaces DRS flap as the overtake aid conceptually), overtake/boost
modes, ~50/50 ICE/electric power, MGU-H removed, smaller/lighter cars, 100%
sustainable fuel, 22 confirmed Grands Prix (calendar adjusted from 24), 6 sprint
weekends. OpenF1 `drs` and timing semantics may evolve by session; the app must
continue to degrade to "—"/honest states.

---

## 4. Feature evaluation

Scores 1–5. "Touchable" = the user operates it in the first minute. "Data
ready" reflects OpenF1/Jolpica free availability and current app state.

| # | Feature | Visible | Touchable | Data ready | Effort | Risk | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| A | **Strategy engine v3** — fuel-adjusted pace, compound-aware degradation, pit loss/traffic/safety-car what-ifs, undercut window, ranked strategies | 5 | 5 | 4 | L | M | Needs careful modelling + clear assumptions; current toy is the base. |
| B | **Telemetry Lab 2.0** — multi-driver throttle/brake/gear/speed/DRS traces, corner deltas, lap overlay, speed heatmap | 5 | 5 | 4 | M | M | `car_data` cached; DRS nulls and sample rates vary by season/session. |
| C | **AI race engineer 2.0** — key-moment narration, "why this happened", strategy explanations grounded in computed facts | 5 | 4 | 4 | M | M | Must not invent; budget/caching/rate limits apply. |
| D | **3D/WebGL track replay** — immersive map, camera follow, procedural or GPS-derived geometry | 5 | 4 | 3 | L | M | Perf/complexity; fallback to 2D required. |
| E | **Qualifying/practice mini-sectors** — real segment strips and sector analysis outside races | 4 | 4 | 3 | M | M | OpenF1 segments meaningful in quali/practice; session-type paths exist but UI/edge cases needed. |
| F | **Historical era (Jolpica 1950+)** — results, standings, pit stops, lap charts, head-to-head history | 4 | 4 | 3 | L | M | CC BY-NC-SA share-alike/licence mixing; no telemetry pre-2023; different UX from replay. |
| G | **Season/standings view** — championship progression, points, team/driver comparison | 4 | 3 | 3 | M | M | OpenF1 championship beta or Jolpica; licence/caching considerations. |
| H | **Weather impact analysis** — weather vs pace/stints, rain/SC correlation | 4 | 3 | 4 | M | L | `weather` + `race_control` + lap times available. |
| I | **Track limits / stewards view** — flags, penalties, incidents timeline, deleted-lap context | 4 | 3 | 3 | M | M | `race_control` rich but textual; parsing/normalisation needed. |
| J | **Pit crew / stop analytics** — stationary vs lane time, stop distribution, outliers | 3 | 3 | 4 | S | L | `pit` data available; `stop_duration` gaps in some sessions. |
| K | **Overtake & battle analytics** — overtake zones, DRS effectiveness, battle summaries from `overtakes` | 4 | 3 | 3 | M | M | `overtakes` may be incomplete; historical interval scan remains noisy. |
| L | **Director/multi-view layouts** — configurable panels, broadcast-style presets | 4 | 3 | 5 | M | L | Frontend-only; risk is complexity/clutter. |
| M | **PWA/offline install** — cached sessions usable offline | 3 | 3 | 5 | M | L | Cache/storage/versioning discipline. |
| N | **Data export** — CSV/JSON for laps, stints, telemetry windows | 3 | 3 | 5 | S | L | Client/server serialisation; no licence breach. |
| O | **MultiViewer/f1-circuits track geometry** — official-ish outlines/rotation/labels | 3 | 2 | 3 | S | M | Endpoint terms unclear; must degrade to GPS-derived map. |
| P | Live timing (OpenF1 sponsor or F1TV) | 5 | 5 | 1 | L | H | Paid/licensed, real-time ops, not portfolio-on-demand. |
| Q | Fantasy/prediction game | 3 | 4 | 2 | L | M | Different product; data/licence/scope creep. |
| R | Team radio transcription/playback guarantees | 3 | 3 | 1 | M | H | Audio rights; 2026 often missing; transcription infra/cost. |

---

## 5. Recommended v3 scope

### Headline (the "v3" claim)

1. **Strategy engine v3 (earn the word "model").**
   - **Goal:** replace the toy pit wall with a transparent, testable strategy
     simulator: fuel-corrected pace baseline, compound-aware degradation curves,
     pit-lane loss, traffic penalty, optional safety-car/virtual-SC scenarios,
     undercut/overcut window, and ranked strategy options.
   - **Data:** OpenF1 `laps`, `stints`, `pit`, `weather`, `race_control`,
     `intervals`/`position` where useful; all historical.
   - **Method (illustrative, to be validated):** linear/segmented or non-linear
     degradation per compound with outlier filtering (pit-out/in-laps, slow laps),
     fuel burn proxy by lap index, and explicit uncertainty bands. Show every
     assumption and input, like v2 but with a defensible model.
   - **Acceptance:** predictions/what-ifs are reproducible from shown inputs;
     break-even and undercut windows are explained; no hidden constants; AI may
     narrate but must not recompute; unit tests cover edge cases (SC laps,
     missing stints, mixed compounds).

2. **Telemetry Lab 2.0.**
   - **Goal:** a first-class analysis view for comparing drivers/laps with
     throttle, brake, gear, speed and DRS traces on a shared distance axis, plus
     corner deltas and hover readouts. Extend lap duel into a general telemetry
     workspace.
   - **Data:** OpenF1 `car_data` windows, `location`/geometry, `laps` sectors and
     speed traps.
   - **Acceptance:** traces align to the replay clock/distance within sample
     tolerance; `null` DRS renders "—"; reduced-motion respected; works on
     qualifying laps and race laps where data exists.

3. **AI race engineer 2.0 (grounded narration).**
   - **Goal:** move from Q&A/recap to proactive, grounded explanations at key
     moments (pit window opens, undercut threat, safety car, position swing) and
     a strategy "why" that cites the engine's numbers.
   - **Data:** computed analysis outputs + existing session facts; no new
     external knowledge.
   - **Acceptance:** every claim traces to a shown number or feed; off-topic and
     unanswerable cases still decline/say-so; rate-limited, cached, server-side
     key unchanged.

### Supporting (high value, bounded)

4. **Qualifying/practice mini-sectors and sector analysis (revisit V2-7).**
   - OpenF1 segments are not usable in races but can be meaningful in
     qualifying/practice outside races. With session-type awareness already
     shipped, add a quali/practice sector-strip view that degrades honestly when
     segments are placeholder/missing.
5. **Weather impact and race-control timeline polish.**
   - Correlate weather/rain/SC/VSC with pace and strategy windows; keep it
     descriptive, not predictive.
6. **Pit crew and overtake analytics (from existing feeds).**
   - Stop-duration distribution, lane vs stationary where available; overtake
     events/zones from `overtakes` with incompleteness clearly marked.
7. **Director layouts + PWA/offline for cached sessions.**
   - Preset layouts and installable/offline replay of already-cached sessions.

### Stretch (only if headline lands)

8. **3D/WebGL replay** (GPS-derived/procedural track, camera modes) with a hard
   2D fallback and perf budget.
9. **Historical era view via Jolpica (1950+).**
   - Results, standings, lap charts, pit stops, head-to-head history for seasons
     without telemetry. Requires explicit licence handling (CC BY-NC-SA data,
     non-commercial, attribution, share-alike considerations) and a separate
     "archive" UX from the 2023+ replay.
10. **Championship progression** (OpenF1 beta endpoints and/or Jolpica), isolated
    behind adapters.

### Deferred / excluded

- **Live timing / live replay:** OpenF1 sponsor tier is paid; official timing is
  licensed. Exclude unless a paid, supported path is chosen deliberately.
- **Historical Fight Finder scan:** rejected in v2 for noisy intervals/sparse
  positions; do not revive without a reliable signal.
- **FastF1 as a runtime data source:** requires F1TV auth; keep as reference only.
- **Team radio transcription/audio guarantees:** rights, availability (often
  absent in 2026), and cost/infra risk.
- **Fantasy/prediction product:** different scope/licence profile.
- **Jolpica data redistribution as a dataset:** dumps/CC BY-NC-SA terms require
  care; display for non-commercial use is fine, repackaging is not assumed.

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 30 req/min shared budget, 20-request full-field location fetches | Cold builds slow/fail under concurrency | Keep token bucket + single-flight; prewarm demo sessions; lazy-load heavy telemetry windows. |
| Strategy model presented as truth | Loss of trust | Show inputs, assumptions, uncertainty; label estimates; unit-test invariants; AI narrates only computed outputs. |
| DRS/segment/stop-duration gaps vary by session/season (2026 regs evolve) | Broken or misleading UI | Degrade to "—"/hidden blocks; never infer states; feature-detect per session. |
| Jolpica CC BY-NC-SA share-alike and dump tiering | Licence incompatibility if mixed/redistributed | Isolate adapter; attribute; non-commercial only; avoid bundling/redistributing dumps; legal review before shipping era features. |
| FastF1 F1TV auth dependency (3.9.0+) | Tempting but unusable free path | Treat as algorithmic reference; no runtime dependency. |
| MultiViewer circuit endpoint availability/terms | Track polish breaks | Optional source with graceful fallback to GPS-derived geometry. |
| 3D/WebGL performance on phones | Jank, battery drain | Perf budget, reduced-motion/off toggle, 2D fallback. |
| Scope creep (era + 3D + live + AI) | v3 never ships | Gate v3 on strategy engine + telemetry lab + AI narration; everything else behind explicit go/no-go. |

---

## 7. Open questions

1. **v3 headline:** is the "real" strategy engine the must-ship claim, or is a
   3D/WebGL replay equally important for the portfolio story?
2. **Historical era:** do we accept Jolpica (CC BY-NC-SA, no telemetry pre-2023)
   as a separate archive view, or keep BoxBox strictly 2023+ replay-focused?
3. **Live:** is any paid path in scope (OpenF1 sponsor €9.90/mo) for a personal
   demo, or is v3 strictly historical/free?
4. **Track geometry:** is using OpenF1's `circuit_info_url` (MultiViewer data)
   acceptable as a best-effort source, or should we stay GPS-derived / MIT
   `f1-circuits` only?
5. **Demo/prewarm:** which sessions should be prewarmed for a v3 showcase, and
   do we add a scripted prewarm step?
6. **AI scope:** should v3 AI gain proactive narration during replay, or remain
   on-demand (chat/recap/explain) to control cost and hallucination surface?

---

## 8. Suggested execution order (once scope is chosen)

1. **V3.0 — research lock:** decide headline, licence posture (Jolpica/track
   geometry), and demo set; tag the v2 baseline as "pre-v3".
2. **V3.1 — strategy engine core:** fuel-adjusted/degradation model, pure
   functions + tests, then pit-wall UI replacement with full assumptions.
3. **V3.2 — Telemetry Lab 2.0:** shared trace components, multi-driver compare,
   corner deltas; extend duel.
4. **V3.3 — AI race engineer 2.0:** grounded moment explanations over computed
   facts; narration only if explicitly enabled.
5. **V3.4 — supporting:** quali/practice mini-sectors, weather/RC/stewards and
   pit/overtake analytics, layouts/PWA/export.
6. **V3.5 — stretch:** 3D replay and/or Jolpica era view, each behind its own
   go/no-go.

---

## 9. What would make v3 "huge" (portfolio lens)

- **From "shows and asks" to "simulates and explains":** v2 lets you ask what
  happened; v3 should let you test *what would have happened* and see why, with
  numbers you can audit.
- **Depth over breadth:** a trustworthy strategy model + telemetry lab beats a
  dozen shallow panels. Every computed claim must be traceable.
- **Honest boundaries preserved:** free, historical, non-commercial, no invented
  data, clear degradation states. That honesty is already BoxBox's differentiator.

---

## 10. Sources (primary, accessed 2026-11-14)

- OpenF1: https://openf1.org/ , https://openf1.org/docs , https://github.com/br-g/openf1
- Jolpica-F1: https://jolpica-f1.com/ , https://api.jolpi.ca/docs/ ,
  https://github.com/jolpica/jolpica-f1 ,
  https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md ,
  https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md ,
  https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md ,
  https://github.com/jolpica/jolpica-f1/blob/main/docs/database_dumps.md
- FastF1: https://docs.fastf1.dev/ ,
  https://docs.fastf1.dev/api_reference/accounts_auth.html ,
  https://docs.fastf1.dev/api_reference/circuit_info.html ,
  https://github.com/theOehrly/Fast-F1
- MultiViewer: https://multiviewer.app/ , https://multiviewer.app/changelog
- Armchair Strategist: https://armchair-strategist.dev/ ,
  https://github.com/Casper-Guo/Armchair-Strategist
- F1 Telemetry (f1data.org): https://www.f1data.org/tutorial
- F1 TV / official: https://www.formula1.com/en/page/what-is-f1-tv-pro ,
  https://www.formula1.com/en/timing/f1-live
- 2026 regulations: https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-2026-regulations.6j0tS0hrHG2T01tpmK6XYz ,
  https://corp.formula1.com/f1-2026-regulations-terminology-update/
- 2026 calendar: https://www.fia.com/news/fia-and-formula-1-announce-2026-calendar ,
  https://www.formula1.com/en/latest/article/formula-1-and-fia-announce-2026-sprint-calendar.3PyLPAazrBNe8kQIS3wOfY
- Strategy simulation references: https://github.com/TUMFTM/race-simulation ,
  https://github.com/Bhooorya/f1-pit-strategy-optimizer
- Curated index: https://github.com/subinium/awesome-f1
- f1-circuits: https://github.com/bacinger/f1-circuits

Claims not directly verifiable from primary sources during this pass are marked
as such in context (e.g. third-party app internals beyond their stated docs);
no unverifiable claim is presented as fact.
