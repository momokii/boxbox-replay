# .claude/state/DECISIONS_LOG.md — Decisions and Rationale

## Bootstrap Decisions (2026-10-28)

---
**Decision:** Root `CLAUDE.md` as auto-loaded entry point importing four files
**Date:** 2026-10-28
**Context:** Claude Code auto-loads only `CLAUDE.md`; other `.claude/` files are not auto-loaded
**Rationale:** Single compact entry point keeps context budget small while guaranteeing rules, standards, and live state load every session
**Alternatives Rejected:** Splitting context across many auto-loads (not supported); one giant file (blows context, stale-prone)
**Security Implications:** Security standards load every session by construction, so the Gate cannot be skipped by forgetting a file
**Impact:** All future sessions start with identical baseline context
---

---
**Decision:** Security-first `settings.json` baseline (deny > ask > allow, no defaultMode)
**Date:** 2026-10-28
**Context:** Need enforcement, not just guidance, for secrets and destructive ops
**Rationale:** Deny secret reads/edits and force-push/sudo; ask on push, destructive deletes, network fetch, prod compose ops; allow only safe read-only git/compose dev commands
**Alternatives Rejected:** Broad `Bash(*)` allow (unsafe); wildcard `.env.*` deny (would block `.env.example`)
**Security Implications:** Reduces accidental secret exposure and destructive runs; Bash matching is text-based, not a full boundary — sandboxing recommended
**Impact:** Stack-specific allow-list proposed after TASK-001 with user confirmation
---

---
**Decision:** Compose v2 dev/prod pattern (`compose.yaml` + auto `compose.override.yaml` + explicit `compose.prod.yaml`)
**Date:** 2026-10-28
**Context:** Need dev/prod parity without dev tooling leaking into production
**Rationale:** Matches Compose v2 automatic-override semantics; prod requires explicit `-f` flags so it never runs accidentally
**Alternatives Rejected:** Single compose file with env conditionals (leak-prone); legacy `docker-compose` binary and `version:` key (obsolete)
**Security Implications:** Prod config drops source mounts, debug ports; least-privilege defaults
**Impact:** Verified commands replace generics once the real Docker setup exists
---

---

## Proposed (pending file-tree confirmation, 2026-10-28)

---
**Decision:** Stack + sources per brief v2 (Python 3.12 satisfies 3.11+; Streamlit/Plotly/pandas-pyarrow/httpx/ruff/pytest; OpenF1 primary, Jolpica memory, FastF1 reference-only)
**Date:** 2026-10-28
**Context:** First real project task; TASK-001 needs purpose + stack confirmed
**Rationale:** Free, auto-updating data; proof shows 2026 sessions already flowing (131); stdlib-only probe respected 3 req/s, no deps installed
**Alternatives Rejected:** FastF1 as fetcher (auth sessions fragile — reference only); live timing (paid window — out of scope)
**Security Implications:** No-auth public APIs; LLM token stays in env (name TBD at M4); empty-telemetry sessions hidden, never faked
**Impact:** Locks M0–M6 scope; Compose pattern likely skipped (no containers — to confirm)
---

---

## Decided during M1 (2026-10-28)

---
**Decision:** Telemetry probe = one driver's car_data per session; hidden sessions listed with reason in an expander
**Date:** 2026-10-28
**Context:** Picker must hide telemetry-empty sessions without downloading full-grid car_data (~20x bytes)
**Rationale:** Single-driver probe is representative and cached; expander keeps the hide reason visible per brief rule
**Alternatives Rejected:** Full-grid probe (bandwidth-heavy); silent omission (brief requires the reason shown)
**Security Implications:** None — same public endpoint, fewer requests (rate-limit friendly)
**Impact:** `session_has_telemetry()` in `data_loader.py`; M1 picker depends on it
---

## v3 Scope Decisions (2026-11-14)

---
**Decision:** D1 — v3 headline is Strategy engine + Telemetry Lab + grounded AI (V3.1–V3.3); 3D is not an equal headline
**Date:** 2026-11-14
**Context:** v2 can show and answer a historical session; v3 needs depth that is feasible on free data
**Rationale:** These three deepen shipped surfaces (pit wall, duel, inputs, Ask) using cached feeds; 3D is visual but high-risk/effort and does not improve the analysis
**Alternatives Rejected:** 3D/WebGL as an equal headline (kept as a gated stretch, V3.5a)
**Security Implications:** None new; same free historical feeds
**Impact:** V3.1–V3.3 are the committed core; V3.5a is go/no-go only
---

---
**Decision:** D2 — Live timing is out of core; v3 stays strictly historical/free
**Date:** 2026-11-14
**Context:** OpenF1 gates live data behind the €9.90/month sponsor tier; the portfolio must work on demand
**Rationale:** A demo cannot depend on a live session or a paid subscription; historical data is free and complete
**Alternatives Rejected:** Paid live tier as a required path (optional personal demo only, never a dependency)
**Security Implications:** No paid credentials in the repo; API key stays server-side where used
**Impact:** Live sessions remain out of scope in docs/plans
---

---
**Decision:** D3 — AI narration is on-demand by default; proactive narration only behind an explicit opt-in
**Date:** 2026-11-14
**Context:** Always-on narration increases cost and the hallucination surface
**Rationale:** Every AI answer should follow a user action and a server-built fact bundle; cost is bounded by the existing 6/min budget and caching
**Alternatives Rejected:** Always-on proactive key-moment narration
**Security Implications:** Smaller prompt/response surface; no client-supplied facts (see V3.3 contract)
**Impact:** Chat/recap/explain actions only; no background AI calls
---

---
**Decision:** D4 — Track geometry stays GPS-derived from session data; MultiViewer is not a dependency
**Date:** 2026-11-14
**Context:** MultiViewer's circuit endpoint has no documented public SLA and its terms are unclear
**Rationale:** The existing session-derived outline is free, reliable and already tested; a best-effort overlay may be added only with graceful fallback
**Alternatives Rejected:** Hard dependency on MultiViewer/f1-circuits for geometry
**Security Implications:** No third-party licensed assets baked in
**Impact:** V3.2/3D work uses the existing geometry path
---

---
**Decision:** D5 — Jolpica 1950+ archive is not in the v3 core; only a separate, isolated view if the licence posture is accepted
**Date:** 2026-11-14
**Context:** Jolpica data is CC BY-NC-SA 4.0 with share-alike/non-commercial constraints and no telemetry pre-2023
**Rationale:** Mixing an archive into the 2023+ replay core risks licence confusion and scope creep; it can be a separate adapter later
**Alternatives Rejected:** 1950+ archive inside the replay core
**Security Implications:** No bulk redistribution; attribution and non-commercial use required if added
**Impact:** V3.5b is a stretch item behind an explicit go/no-go
---

---
**Decision:** D6 — Demo prewarm set is scripted, not ad hoc: 2026 United States GP, 2024 Suzuka, 2024 Monaco
**Date:** 2026-11-14
**Context:** Cold opening a race takes ~1 minute against the 30 req/min free budget
**Rationale:** Prewarming a small, known set makes a demo feel instant without extra code
**Alternatives Rejected:** No prewarm / ad-hoc opening at demo time
**Security Implications:** None; cache only
**Impact:** Ops action before a public demo; documented in DEPLOYMENT/V3 plan
---

## v3 Stretch Decisions (2026-11-14)

---
**Decision:** D7 — 3D/WebGL replay is a no-go for v3
**Date:** 2026-11-14
**Context:** V3.5a gated on a performance budget and a 2D fallback
**Rationale:** The 2D canvas already holds 60 fps and carries the data; 3D adds a renderer, camera controls and a11y work without making the analysis better. No user request justifies it now.
**Alternatives Rejected:** Three.js scene for v3
**Security Implications:** Avoids a large new dependency surface
**Impact:** 3D stays a future go/no-go, not a v3 promise
**Superseded:** D10 (user requested the optional view; shipped in `v3.5.0`)
---

---
**Decision:** D8 — Jolpica 1950+ archive is a no-go under the current licence posture
**Date:** 2026-11-14
**Context:** V3.5b required accepting CC BY-NC-SA share-alike/attribution and a separate archive surface
**Rationale:** Mixing an archive into a 2023+ replay product adds licence care (share-alike) for no telemetry benefit; the portfolio does not need pre-2023 data.
**Alternatives Rejected:** Jolpica adapter in v3
**Security Implications:** No third-party archive data cached or redistributed
**Impact:** Revisit only if the licence posture is explicitly accepted
**Superseded:** D11 (non-commercial use accepted; shipped `v3.6.0`)
---

---
**Decision:** D9 — Championship progression is deferred, not built
**Date:** 2026-11-14
**Context:** V3.5c could use OpenF1 championship beta endpoints
**Rationale:** A season/standings view is a separate product surface; the beta endpoints are per-session points snapshots, and v3 already covers the race-analysis core. Adding it would dilute the milestone.
**Alternatives Rejected:** Season tab in v3
**Security Implications:** None new
**Impact:** Documented as a future feature; no code
**Superseded:** D11 (shipped `v3.6.0`)
---

## v3.5 3D Decision (2026-11-14)

---
**Decision:** D10 — Ship V3.5a as an optional, lazy 3D view inside Replay
**Date:** 2026-11-14
**Context:** The user asked for a visually pleasing 3D view after D7; the 2D map is still the analytical surface
**Rationale:** A perspective view of the same cars/clock adds visual value without changing the data or the analysis. Keeping it inside Replay avoids a second product surface; lazy loading keeps it out of the main bundle.
**Alternatives Rejected:** Top-level 3D menu (splits replay context); CSS-only 3D (no camera/scene); fabricated elevation/width (violates the honesty rule)
**Security Implications:** three.js is a lazy frontend-only dependency; no new API, key or data source; the chunk is not cached offline
**Impact:** V3.5a shipped in `v3.5.0`; D7 is superseded. V3.5b (Jolpica, D8) and V3.5c (standings, D9) are unchanged
---

## v3.6 Archive Decision (2026-11-15)

---
**Decision:** D11 — Use Jolpica F1 for season standings and the pre-2023 archive
**Date:** 2026-11-15
**Context:** The user asked for standings and a Jolpica archive with missing-data fallbacks; D8/D9 assumed a stricter licence posture
**Rationale:** Jolpica's Terms allow free non-commercial use under CC BY-NC-SA 4.0 with attribution and a custom User-Agent. The app is non-commercial, displays the source/licence, caches responses, and does not redistribute dumps. One adapter serves both the standings tab and the archive.
**Alternatives Rejected:** OpenF1 beta championship endpoints for progression (session-scoped, 2023+ only); scraping; paid archives
**Security Implications:** Server-side only, validated year/round integers, 4/s + 500/h limits, one-hour cache, no key, no user URL passthrough
**Impact:** V3.5b/V3.5c shipped in `v3.6.0`; D8/D9 superseded. Replay telemetry remains OpenF1-only from 2023
---

## v3.7 Freshness / Comparison Decision (2026-11-15)

---
**Decision:** D12 — Show checked time + Refresh, compare selected drivers, and keep archive loading explicit
**Date:** 2026-11-15
**Context:** User feedback on stale-looking archive/standings, missing chart tooltips, blank telemetry, and unexplained controls
**Rationale:** Jolpica is volunteer-maintained and cached for one hour; a visible checked time and bypass make freshness honest. Round tooltips and a selected-driver/head-to-head view turn a busy chart into an auditable comparison. Archive changes clear the old table and show what is loading.
**Alternatives Rejected:** Silent polling (load/rate cost with no visible freshness), hover-only charts, keeping old archive tables during a season switch
**Security Implications:** Refresh respects the existing 4/s + 500/h limiter; no new input surface
**Impact:** v3.7.0; all related docs/screenshots updated
---

## v3.8 Windows / Share Card Decision (2026-11-15)

---
**Decision:** D13 — Make time windows explicit, freeze Battle on demand, and rotate share-card cars
**Date:** 2026-11-15
**Context:** User feedback on the moving Telemetry window, Battle always following replay, mini-sector readability, driver images, and cars falling below the share-card circuit
**Rationale:** A stable window is required for comparison; replay/lap/session scopes cover both live and analytical use. Share the pure resolver, keep Battle's playback untouched, and apply the same geometry rotation to cars as the outline. Driver images are available from OpenF1's `headshot_url` but are hosted by F1, so they stay remote with a number fallback.
**Alternatives Rejected:** Forcing a single fixed window (breaks live use); letting Battle move the main playback (destructive); rehosting headshots (rights/caching risk)
**Security Implications:** No new input surface; headshots are remote and optional
**Impact:** v3.8.0; docs/screenshots/state updated
---

## v3.9 Battle Snapshot Decision (2026-11-15)

---
**Decision:** D14 — Snapshot truncates history, and image state is per driver
**Date:** 2026-11-15
**Context:** Battle snapshot only appeared to change “Battles now”; driver cards showed fallback images after switching drivers
**Rationale:** A point-in-time snapshot must stop historical charts at that point, or it reads as inert. The main playback stays independent. Headshot state keyed only by a boolean leaked across reused cards; keying by driver+URL gives each card its own lifecycle.
**Alternatives Rejected:** Only freezing “Battles now” (confusing); moving the global replay clock (destructive); rehosting headshots (rights/caching)
**Security Implications:** Remote images remain optional and fall back to a number
**Impact:** v3.9.0; docs/screenshots/state updated
---

## v3.10 Report / Download Decision (2026-11-15)

---
**Decision:** D15 — Print-first report and client-side CSV/JSON downloads
**Date:** 2026-11-15
**Context:** User requested scoped AI fixes, stint explanations, a download menu, and a professional per-session report with data and AI modes
**Rationale:** A print-first HTML report keeps one layout, preserves graphics/tables and produces A4 PDFs through the browser without adding a parallel PDF renderer. CSV/JSON keep exports local and honest; CSV is labelled Excel-compatible and limited to one table per file, while JSON bundles several.
**Alternatives Rejected:** jsPDF/ReportLab parallel layout (duplicate design, extra dependency); fake .xlsx files (misleading); server export endpoints (unnecessary data movement)
**Security Implications:** No secrets or new API surface; exports are generated in the browser from already-loaded data
**Impact:** v3.10.0; docs/screenshots/state updated
---

## v3.10.1 Report Polish Decision (2026-11-15)

---
**Decision:** D16 — Make the report the session-wide data surface and print it without app layout
**Date:** 2026-11-15
**Context:** The printable report had an unclosed circuit path, blank lead pages, sparse definitions, and downloads were placed inside Performance even though they covered the whole session
**Rationale:** Session-wide data belongs with the session report. A closed polygon represents the circuit; hiding non-report root siblings removes blank print pages. Measured key takeaways and a glossary make the report readable without F1 expertise; `/ai/report` adds the three-part analysis (what decided it, tyres/pits, caveat) rather than a story alone.
**Alternatives Rejected:** Keeping downloads only in Performance (wrong scope); hiding with visibility only (reserves blank pages); a free-form AI paragraph (insufficient analysis)
**Security Implications:** No new data source; AI remains optional and failure-isolated
**Impact:** v3.10.1; docs/screenshots/state updated
---

## v3.10.3 Download Access / Print Gate Decision (2026-11-15)

---
**Decision:** D17 — Put session downloads in the header and gate printing on AI completion
**Date:** 2026-11-15
**Context:** Downloads were only reachable after opening Report; Print could be pressed while AI analysis was still generating; report pit visits were confused with timed stops
**Rationale:** Session-wide data should be one click from the session header. Printing mid-generation risks an incomplete AI section, so Print/Save PDF is disabled until the analysis resolves or fails. Report cards explicitly distinguish all pit visits from visits with a timed stationary stop.
**Alternatives Rejected:** Leaving downloads only inside Report (hidden); disabling the whole report while AI runs (data report must stay usable); treating unmeasured stops as timed
**Security Implications:** None new; same client-side export and optional AI endpoint
**Impact:** v3.10.3; docs/screenshots/state updated
---

## v3.10.4 Empty-State / Label Decision (2026-11-15)

---
**Decision:** D18 — Label the export action explicitly and never render an empty timed-stop table
**Date:** 2026-11-15
**Context:** Header said only “Download”; a session with pit visits but no stationary times showed an empty Driver/Lap/Stationary table and a duplicated explanation
**Rationale:** “Download data” names the action. A no-timed-stops feed gets an explicit state that reports the number of pit visits and explains why median/best are unavailable; the overtakes table remains independent. No timing value is invented.
**Alternatives Rejected:** Hiding the whole Pit crews section (overtakes are still useful); showing zero times; keeping empty headers
**Security Implications:** None
**Impact:** v3.10.4; docs/screenshots/state updated
---

## v3.11 Build Cancellation Decision (2026-11-15)

---
**Decision:** D19 — Expose replay build progress and cancel stale session builds
**Date:** 2026-11-15
**Context:** Cold Baku/Austria loads took very long; switching sessions left the old build consuming OpenF1’s 30/min budget
**Rationale:** A cold replay needs one /location request per driver. The free budget cannot be raised, and the bulk endpoint rejects the request as too much data. Progress makes the cost visible; cancellation stops superseded work before it consumes more budget. Per-driver location caches remain reusable and partial replay files are never written.
**Alternatives Rejected:** Raising the upstream rate (not allowed on free tier); bulk location (upstream 422); keeping stale builds running
**Security Implications:** Local status/cancel endpoints expose no data and no upstream credentials
**Impact:** v3.11.0; docs/README/state updated
---

## v3.12 Hover Speed Decision (2026-11-15)

---
**Decision:** D20 — Fetch speed for the hovered driver on demand
**Date:** 2026-11-15
**Context:** Hover cards for non-followed drivers showed “speed loading…” forever because only followed/default drivers were prefetched
**Rationale:** One small request per first hover is cheaper than prefetching all drivers against a 30/min budget. Caching empty/error results lets the card say “speed —” instead of misrepresenting a failed request as loading.
**Alternatives Rejected:** Prefetch all drivers (budget); hide the speed line (loses a useful datum); keep the infinite loading label
**Security Implications:** Same server-side OpenF1 endpoint; no new data exposure
**Impact:** v3.12.0; docs/screenshot/state updated
---

## v3.13 Close-out Decision (2026-11-15)

---
**Decision:** D21 — Add a same-origin CSP/security headers and remove non-product artifacts
**Date:** 2026-11-15
**Context:** Public-repo readiness review found tracked `.coverage`, stale pre-v3 Playwright scripts, and no browser security header baseline
**Rationale:** The app is a same-origin static SPA plus API; a CSP limited to self, Google Fonts, F1 headshots and HTTPS audio preserves functionality while reducing injection/framing risk. Keep the product tree free of generated coverage and stale tooling. A security policy and contributor guide make the public boundary explicit.
**Alternatives Rejected:** No CSP (needless exposure); a CSP that breaks external fonts/headshots (tested and adjusted); deleting docs history (kept)
**Security Implications:** Adds nosniff, frame denial, referrer, permissions and CSP headers; no secrets or new endpoints
**Impact:** v3.13.0; docs/security policy/closeout updated
---

## v4 3D truth and Grid decisions (2026-11-22)

---
**Decision:** D22 — True relative car/track proportions with Follow/Overview/Free cameras
**Date:** 2026-11-22
**Context:** v3 cars were ~8× too large relative to the 100-unit circuit, making the 3D view feel anecdotal; the 3D overview also showed retired cars because it used every entry.
**Rationale:** A 5.6 m car against a 12 m visual track width gives a credible ratio. Follow keeps it readable; Overview uses markers at true track scale; Free allows inspection. Width remains a visual constant because OpenF1 publishes no metric width or lateral placement.
**Alternatives Rejected:** Keeping the large car (dishonest scale); fake elevation; pretending the ribbon is measured.
**Security Implications:** No new data or permissions; same lazy WebGL surface.
**Impact:** v4.0.0; 3D component/geometry tests and screenshots updated.
---

---
**Decision:** D23 — Use a short recorded pit transit when usable; otherwise label the pit guide schematic
**Date:** 2026-11-22
**Context:** OpenF1 `/location` includes pit transit samples but documents no lateral placement. A recorded transit can be a useful orientation guide; a metrically exact lane is not supportable.
**Rationale:** Reject lap-sized or missing transit windows; show a short recorded path labelled “approximate”, or a fallback schematic. Pit events themselves remain real.
**Alternatives Rejected:** Drawing a real pit lane from undocumented coordinates; inventing a pit box geometry without a source; omitting the pit guide entirely.
**Security Implications:** No new data; display-only.
**Impact:** v4.0.0; `pitlane.ts`, 2D/3D guide and honesty note.
---

---
**Decision:** D24 — BoxBox Grid is a local seeded game, not a prediction
**Date:** 2026-11-22
**Context:** The requested local race game needs real-season driver/team form and a playable race without misrepresenting a forecast.
**Rationale:** Use final Jolpica standings for completed seasons (current table for the latest), combine 58% points + 42% position into driver form and 64% driver + 36% team overall, then apply seeded qualifying/race variation. 1–4 players, one driver each, 3/5/10 laps, run/skip qualifying. No tyre/pit/collision/reliability model in v1.
**Alternatives Rejected:** Uniform random grids; hard-coded or invented stats; claiming the game result is a real-world prediction; pre-2023 circuits with no geometry.
**Security Implications:** Pure client-side; no new endpoint, key or personal data. Source attribution remains Jolpica + OpenF1.
**Impact:** v4.0.0; `game.ts`, `GameView`, tests, README/closeout.
---

## v4.1 UI correction decisions (2026-11-22)

---
**Decision:** D25 — Replace the recorded pit-transit overlay with a labelled schematic lane
**Date:** 2026-11-22
**Context:** Baku 2D showed white dashes and 3D showed a duplicate-looking line; the recorded path is not a validated lateral pit lane and could read as a second circuit.
**Rationale:** A short solid schematic lane beside start/finish is honest, unambiguous and labelled. Pit events remain real; no measured width is claimed.
**Alternatives Rejected:** Keeping the ambiguous recorded path; dropping the pit guide entirely; inventing a measured lane.
**Impact:** v4.1.0; 2D/3D pit guide and screenshots.
---

---
**Decision:** D26 — Grid uses exact track progress and a watchable clock
**Date:** 2026-11-22
**Context:** The v4.0 Grid race pushed markers sideways for legibility, making cars look off-circuit, and 1× compressed a lap to 2.3 s.
**Rationale:** Cars belong on the circuit; the tower is the disambiguation surface. Player rings identify humans. 1× at ~8 s/lap keeps a 5-lap race around 40 s without a false finish.
**Alternatives Rejected:** Lateral offsets; real 90 s/lap (too slow for a game); keeping 2.3 s/lap.
**Impact:** v4.1.0; GameCanvas and GameRace; tests/screenshots.
---

## v4.2 Grid UX decisions (2026-11-22)

---
**Decision:** D27 — Make qualifying a visible phase and hover a pace/mode card in Grid
**Date:** 2026-11-22
**Context:** The v4.1 checkbox only changed the grid heading; the Grid canvas had no hover handler. Users could not tell that qualifying happened or inspect a car.
**Rationale:** A single flying-lap qualifying screen with pole/order/gaps makes the checkbox real. Hover exposes only defensible simulation data: position, player/AI, lap, pace, gap and derived mode. No fake km/h.
**Alternatives Rejected:** Jumping straight to grid; adding a fabricated speed channel; a full Q1/Q2/Q3 format in v1.
**Impact:** v4.2.0; GameView/GameCanvas/game.css.
---

---
**Decision:** D28 — Add a selected-driver telemetry card to 3D
**Date:** 2026-11-22
**Context:** The 3D view had Follow/Overview/Free and markers but no selected-car readout; the 2D map had position/gap/tyre/speed.
**Rationale:** Reuse the existing `hoverInfo` bundle in a compact 3D HUD. It improves the 3D without inventing a second data path or changing scale.
**Alternatives Rejected:** Duplicating telemetry logic inside Track3D; adding fake car data; a separate 3D-only endpoint.
**Impact:** v4.2.0; Track3D/SessionMap/index.css.
---

## v4.3 Grid lap/qualifying decisions (2026-11-22)

---
**Decision:** D29 — Map lap progress modulo one for the Grid circuit; make Run/Skip visible
**Date:** 2026-11-22
**Context:** `progress / laps` compressed five laps into one circuit; the qualifying checkbox and static grid did not feel different from skipping.
**Rationale:** Each lap must cross the whole circuit (`lapFraction`), covered by a regression test. Run/Skip segmented controls, matching start-button copy and a live single-flying-lap session make the hand-off visible without inventing Q1/Q2/Q3.
**Alternatives Rejected:** Keeping the divided circuit; faking km/h; a no-op checkbox; full elimination format.
**Impact:** v4.3.0; GameCanvas/GameView/game.ts tests/screenshots.
---

---
**Decision:** D30 — Preserve an explicit Grand Prix selection and separate session loading
**Date:** 2026-11-22
**Context:** A late calendar response could reset the selected meeting to round 1; the global table loading state also leaked into the roster during session fetches.
**Rationale:** Functional setMeetingKey preserves a valid explicit selection; loadingSessions is separate from standings loading. The header now reliably matches the chosen circuit.
**Impact:** v4.3.0; GameView.
---

## Decision Template (copy for every new decision)

---
**Decision:** [What was decided]
**Date:** [YYYY-MM-DD]
**Context:** [Why it was needed]
**Rationale:** [Why this option]
**Alternatives Rejected:** [Other options and why not]
**Security Implications:** [Any security impact]
**Impact:** [What it affects downstream]
---

---
**Decision:** D31 — Grid incidents are seeded game events with stated time losses.
**Date:** 2026-11-22
**Context:** v4.4 adds SC/VSC/crash incidents to the local Grid race, but the app must not imply real race-control reconstruction or collision physics.
**Rationale:** Generate deterministic events from the race seed; SC/VSC add a stated lap-time loss to active cars, a crash retires one active driver, and the UI labels the banner as a game event. SC/VSC are labelled as time additions, not “field bunched”.
**Alternatives Rejected:** Reconstructing real yellow periods (not in Grid data/model); visual collision simulation (out of scope and would imply measured physics); random non-deterministic events (breaks reproducibility).
**Security Implications:** None; client-only simulation, no new data or secrets.
**Impact:** `game.ts`, `GameView.tsx`, `game.test.ts`, V4.4 docs.

---
**Decision:** D32 — Driver desk lives in the race order column.
**Date:** 2026-11-22
**Context:** The first desk placement below the canvas was off-screen at 900 px and the right column had unused space.
**Rationale:** Put the desk above the order table with a compact single-column layout and a scrollable 250 px tower. It is visible on desktop, still keyboard/clickable, and stacks inside the same column on mobile.
**Alternatives Rejected:** A modal (interrupts live race); a bottom sheet (hides data); scrolling the page on selection (jarring and invisible).
**Security Implications:** None.
**Impact:** `GameView.tsx`, `game.css`, screenshot 67.

---
**Decision:** D33 — Qualifying summary fills the card with facts, not decoration.
**Date:** 2026-11-22
**Context:** The v4.3 summary was left-aligned and the right side was empty.
**Rationale:** Add Pole, Pole lap, Player/AI and Field as a real `<dl>` beside the progress; keep the existing live progress. On phones the facts stack under the progress. No invented values: missing pole shows “—”.
**Alternatives Rejected:** Stretching a single line across the card (still looks empty); adding decorative copy (no information).
**Security Implications:** None.
**Impact:** `GameView.tsx`, `game.css`, screenshots 55.

---
**Decision:** D34 — Angle view is a projection of the same circuit, not new geometry.
**Date:** 2026-11-22
**Context:** The Grid circuit was top-down only; users asked for more angle.
**Rationale:** Use one `project()` function for track, start line, markers, labels and hit-testing. Angle is a fixed rotation plus vertical compression, explicitly illustrative. Top remains the default and analytical view.
**Alternatives Rejected:** A second data path or a faux-3D elevation (would imply measured geometry); WebGL for the Grid (additional weight for a 2D model).
**Security Implications:** None.
**Impact:** `GameCanvas`, `game.css`, screenshot 66.

---
**Decision:** D35 — 1× is a 12 s/lap viewing pace.
**Date:** 2026-11-22
**Context:** The v4.4 1× clock ran at roughly 8 s/lap (five laps about 40 s); review feedback said it was too fast to follow the desk, banners and passes.
**Rationale:** Set `GAME_SECONDS_PER_LAP = 12`; `gameClockScale = duration / (laps * 12)`. Five laps take about 60 s, three about 36 s, ten about 120 s. 2× and 4× remain. The UI labels it as a viewing pace, never real time.
**Alternatives Rejected:** Real-time model (~90 s/lap; far too long); 8 s/lap (reviewed as too fast); a speed slider (more UI than needed).
**Security Implications:** None.
**Impact:** `game.ts`, `GameView.tsx`, tests, README.

---
**Decision:** D36 — Two seeded qualifying runs; best counts.
**Date:** 2026-11-22
**Context:** The single flying lap gave one noise sample and left the attempt dimension out of the screen.
**Rationale:** `QUALI_ATTEMPTS = 2`; each driver gets two seeded laps; `time = min(attempts)`. The table shows both, the summary shows Runs, and the copy explicitly says this is not Q1/Q2/Q3 elimination.
**Alternatives Rejected:** Three runs (more screen time without new information); full Q1/Q2/Q3 (would imply a format the model does not implement).
**Security Implications:** None.
**Impact:** `game.ts`, `GameView.tsx`, `game.css`, tests, docs.

---
**Decision:** D37 — Start race uses a five-light transition, not another decision screen.
**Date:** 2026-11-22
**Context:** Clicking “Lights out” started the clock immediately, leaving no ready moment.
**Rationale:** The grid action is Start race. `GameRace` shows five lights over about 3.6 s; the clock is frozen at 0, pause/speed/Skip are disabled, then the race starts automatically. The grid table scrolls so the action is visible.
**Alternatives Rejected:** A second confirmation click; a static countdown with no lights; auto-starting without a user action.
**Security Implications:** None.
**Impact:** `GameView.tsx`, `game.css`, screenshots 54/70/72.

---
**Decision:** D38 — Result sharing is a client-side 1200×630 PNG.
**Date:** 2026-11-22
**Context:** The result screen had no share artifact; the replay already had a client-side canvas share card pattern.
**Rationale:** Add `gameShareCard.ts` using a canvas, with winner, top 10 plus any player outside, gaps/DNF, incidents, seed and disclaimer. Download with `toBlob` + `<a download>`. No server, no upload, no PDF dependency.
**Alternatives Rejected:** Screenshot service (new backend/privacy surface); PDF (the review asked for an image); all 25 rows (unreadable at 1200×630).
**Security Implications:** Client-only; no data leaves the browser.
**Impact:** `gameShareCard.ts`, `GameShareCard.test.ts`, `GameResult`, screenshots 57/71.

---
**Decision:** D39 — 1× is a 20 s/lap viewing pace.
**Date:** 2026-11-22
**Context:** 12 s/lap still felt too fast for the banner, order and desk.
**Rationale:** Set `GAME_SECONDS_PER_LAP = 20`; five laps ≈100 s, ten ≈200 s. 2×/4× remain. Label it as a viewing pace.
**Alternatives Rejected:** Real-time (~90 s/lap); another small step to 15 s; a user speed slider.
**Security Implications:** None.
**Impact:** `game.ts`, labels, README, screenshots.

---
**Decision:** D40 — Per-lap driver modal from the desk, not a replacement for selection.
**Date:** 2026-11-22
**Context:** The desk shows only current/last pace; review wants per-lap numbers and a popup.
**Rationale:** Add `driverLapHistory`; a `Lap by lap` button and tower double-click open the existing accessible Modal. Single click still selects for the desk. Retirement rows have `time: null` and DNF status, never a fabricated partial lap.
**Alternatives Rejected:** Opening a modal on every single car click (interrupts the race); a second data source; inventing sectors.
**Security Implications:** None; client-only.
**Impact:** `game.ts`, `GameView`, `game.css`, modal screenshot 73.

---
**Decision:** D41 — Result image carries fastest lap, biggest mover, players and DNFs.
**Date:** 2026-11-22
**Context:** The v4.5 result card was visually complete but still mostly a table.
**Rationale:** Compute fastest completed lap, biggest grid-to-finish gain only when positive, player count and DNF count; draw a four-stat strip above the top-10 + players table.
**Alternatives Rejected:** All 25 rows (unreadable); invented telemetry stats; a second screenshot service.
**Security Implications:** None; client canvas.
**Impact:** `gameShareCard.ts`, tests, screenshot 71.

---
**Decision:** D42 — VSC/SC slow playback for a bounded window.
**Date:** 2026-11-22
**Context:** The banner claimed time loss but the animation looked unchanged.
**Rationale:** `incidentPlaybackFactor` scales the viewing clock (SC 0.35 for 12 model seconds, VSC 0.45 for 8). The model and result are unchanged; the banner says PLAYBACK SLOWED and the time loss remains separate.
**Alternatives Rejected:** Moving cars arbitrarily (distorts positions); field-bunching physics (out of scope); a purely decorative yellow overlay.
**Security Implications:** None.
**Impact:** `game.ts`, `GameView`, tests, docs.

---
**Decision:** D43 — Zoom, drag-pan and a more pronounced angle.
**Date:** 2026-11-22
**Context:** Top/Angle looked nearly identical and the user could not inspect a corner.
**Rationale:** Zoom 1–2.5× with wheel/buttons; pan by drag when zoomed; Fit resets both; apply after the existing projection so hit-testing/hover stay consistent. Angle uses a stronger rotation/compression but remains illustrative.
**Alternatives Rejected:** Mouse-only wheel without controls; WebGL; a new geometry source.
**Security Implications:** None.
**Impact:** `GameView`, `game.css`, screenshots 66/74.

---
**Decision:** D44 — Calendar and font loading must not blank the app.
**Date:** 2026-11-22
**Context:** E2E exposed two resilience failures: the GP picker waited for the standings request, and an unreachable Google Fonts stylesheet blocked the deferred module script.
**Rationale:** Load meetings and standings independently; set page loading false only when both settle. Start the font stylesheet as `media="print"` and switch it to `all` in the app boot so a font CDN outage falls back to system fonts.
**Alternatives Rejected:** Removing web fonts; a blocking font stylesheet; a backend timeout-only fix.
**Security Implications:** None.
**Impact:** `GameView`, `index.html`, `main.tsx`.

---
**Decision:** D45 — Bound archive loading and make failure retryable.
**Date:** 2026-11-22
**Context:** A hard restart still showed “Loading the table…” because Jolpica used three 30-second attempts plus backoff, and the frontend had no timeout/retry.
**Rationale:** Use a 4-second archive timeout, two attempts and short backoff; use a 15-second AbortController for standings/meetings; clear roster loading when standings settles; show an explicit Retry action. Never fabricate a standings table when the archive is unavailable.
**Alternatives Rejected:** Leaving the 30-second retries; an unbounded UI fetch; a fake/empty driver list; hiding the start action without an explanation.
**Security Implications:** None; timeout is client/server configuration, no new data exposure.
**Impact:** `jolpica.py`, `web/src/api.ts`, `GameView`, tests, screenshot 75.

---
**Decision:** D46 — Driver identity hovers use optional OpenF1 headshots.
**Date:** 2026-11-23
**Context:** The Grid showed only codes, while the replay already had headshots and full names.
**Rationale:** Load `drivers(sessionKey)` once with a 15 s bound, match by number then code, and show an identity card on setup/qualifying/grid/order/canvas hover. A failed image or media request falls back to the number; it never blocks the game.
**Alternatives Rejected:** Rehosting F1 images; showing a wrong photo by name-only match; blocking the roster on media.
**Security Implications:** External images already allowed by CSP; no new upload or secret.
**Impact:** `GameView`, `game.css`, media screenshots 76.

---
**Decision:** D47 — Order becomes a full-width timing strip; live feed takes the side column.
**Date:** 2026-11-23
**Context:** The narrow right order showed only gap and left the circuit side visually sparse.
**Rationale:** Put order below the circuit with Pos/Driver/Team/Gap/Int/Last/Best/Mode/Player derived from the model, and use the right column for a deterministic live feed (current incident + leader/pass/event reports) above the desk. The feed is explicitly labelled SIMULATED.
**Alternatives Rejected:** A generic card dashboard; invented tyre/speed columns; live race-control claims.
**Security Implications:** None.
**Impact:** `game.ts` `buildRaceFeed`, `GameView`, CSS, screenshots 77–79.

---
**Decision:** D48 — Result card adds winner best/average/laps-led.
**Date:** 2026-11-23
**Context:** The richer race view should be reflected in the share artifact.
**Rationale:** Compute from completed simulated laps and leader boundaries; add a 5-stat strip and winner BEST/AVG context while keeping the top-10 + players table. No unmeasured metric is added.
**Alternatives Rejected:** All 25 rows; fabricated telemetry; separate PDF.
**Security Implications:** None; client canvas.
**Impact:** `gameShareCard.ts`, tests, screenshot 71.

---
**Decision:** D49 — Driver lap history is current-clock filtered.
**Date:** 2026-11-23
**Context:** Opening the lap modal at Lap 1 showed all five simulated laps and Finished status.
**Rationale:** Add an elapsed cutoff to `driverLapHistory`; the modal passes the live clock, shows only completed rows, and derives Running/DNF/Finished from the current clock. At Lap 1 it says no completed laps yet.
**Alternatives Rejected:** Showing future laps dimmed (still leaks results); hiding the modal (loses useful history).
**Security Implications:** None.
**Impact:** `game.ts`, `GameView`, tests, screenshot 80.

---
**Decision:** D50 — Order sits inside the circuit column; metric headers use Info; incidents get a canvas spotlight.
**Date:** 2026-11-23
**Context:** The order after the taller side column left a large blank left band, rain headers had no explanations, and incidents were only text.
**Rationale:** Place order immediately under the canvas, use the existing accessible Info component for every metric header, and draw SC/VSC amber overlays or a crash ring at the last modeled car position. The feed remains the detailed history.
**Alternatives Rejected:** Filling the gap with decorative content; native title-only tooltips; fake 3D incident geometry.
**Security Implications:** None.
**Impact:** `GameView`, `game.css`, docs/state, screenshots 77/78/81.

---
**Decision:** D51 — Incident visuals have explicit active windows.
**Date:** 2026-11-23
**Context:** Crash rings and SC/VSC track overlays persisted until the next event, even at the finish.
**Rationale:** SC 12, VSC 8 and crash 6 model seconds; `activeRaceEvent` drives banner, feed current card, canvas spotlight and playback factor. Historical reports remain in `buildRaceFeed`.
**Alternatives Rejected:** Clearing on next event (stale at the finish); permanent overlays (misleading); deleting history (loses the report).
**Security Implications:** None.
**Impact:** `game.ts`, `GameView`, tests, screenshots 83/84.

---
**Decision:** D52 — Grid loading uses bar + spinner + skeleton.
**Date:** 2026-11-23
**Context:** Long standings/session waits showed text-only loading, easily mistaken for a stuck page.
**Rationale:** Add a sticky indeterminate bar for any Grid load, spinner/skeleton rows for the driver table, and a spinner in Building circuit. Respect reduced motion with static indicators.
**Alternatives Rejected:** A percentage fake progress bar; a blocking full-screen modal; text-only loading.
**Security Implications:** None.
**Impact:** `GameView`, `game.css`, screenshot 82.

---
**Decision:** D53 — Driver portraits require number + timing code.
**Date:** 2026-11-23
**Context:** A number-only OpenF1 match produced a Ricciardo portrait/name for a Verstappen hover; a reused image could also lag behind the new identity.
**Rationale:** `matchDriverMedia` requires number and name_acronym agreement (code-only when number is missing) and never borrows a portrait. Text uses canonical `GameDriver` values; images are keyed by URL.
**Alternatives Rejected:** Number-only matching; trusting media full_name; hiding all photos.
**Security Implications:** None.
**Impact:** `game.ts`, `GameView`, test, screenshot 76.

---
**Decision:** D54 — Full event history is reachable live and after the flag.
**Date:** 2026-11-23
**Context:** The live feed intentionally showed four latest reports, but the user needs the whole race history.
**Rationale:** Add a shared `RaceFeedModal` behind **All events** (events reached so far) and **View all events** on the result (full distance). History remains explicitly model-derived.
**Alternatives Rejected:** Expanding the side panel indefinitely; showing only four with no escape hatch; exposing future events live.
**Security Implications:** None.
**Impact:** `GameView`, `game.css`, screenshots 85/86.
