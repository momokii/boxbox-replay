# V4 — Research sources: 3D replay + local racing game

**Scope.** Primary-source check for a v4 plan that (a) deepens the 3D replay and
(b) adds a local race-management layer. Research only — no app code changed.
Probes were run on 2025-11-21 against the live public APIs; each probe bullet
links the exact request used, so the numbers can be re-checked.

**Legend.** `[source]` = official docs, schema, or source code. Anything marked
**UNVERIFIED** is either undocumented upstream or was not reproduced here.

---

## 1. OpenF1 — coordinate frame, pit, results, race control

### 1.1 `/location`: what the docs actually say

- "The approximate location of the cars on the circuit, at a sample rate of about 3.7 Hz" ([OpenF1 docs — Location](https://openf1.org/docs/)).
- "Useful for gauging their progress along the track, but lacks details about lateral placement — i.e. whether the car is on the left or right side of the track" ([OpenF1 docs — Location](https://openf1.org/docs/)).
- "The origin point (0, 0, 0) appears to be arbitrary and not tied to any specific location on the track" ([OpenF1 docs — Location](https://openf1.org/docs/)).
- Fields are `date`, `driver_number`, `meeting_key`, `session_key`, `x`, `y`, `z`; each axis is only described as "The 'x'/'y'/'z' value in a 3D Cartesian coordinate system representing the current approximate location of the car on the track" ([OpenF1 docs — Location](https://openf1.org/docs/)).
- **Units are never stated** — no metre, no decimetre, no axis convention (which way is up), no handedness. **UNVERIFIED** by documentation ([OpenF1 docs — Location](https://openf1.org/docs/)).
- The schema is published only through the docs page; the API's own OpenAPI spec exposes just `/metrics`, so there is no machine-readable schema to check against ([api.openf1.org/openapi.json](https://api.openf1.org/openapi.json)).

### 1.2 `/location`: measured scale and frame (probes, not docs)

- Horizontal scale is ≈0.1 m per unit: a 100 s Monza 2023 trace is 52,977 units long, which only reconciles with real lap distance at ~0.1 m/unit ([probe: session 9161, driver 81](https://api.openf1.org/v1/location?session_key=9161&driver_number=81&date%3E=2023-09-16T13:03:30&date%3C=2023-09-16T13:05:10)).
- The repo already encodes the same conclusion: "OpenF1 /location coordinates are not metres (they are roughly 10x)" ([analysis.py:92](../analysis.py)).
- `z` behaves like elevation in the same ≈0.1 m unit, and its **spread** matches known circuit relief: Spa 2023 `z` 3655→4679 (spread 1024 ≈ the circuit's ~102 m climb); Monza 2024 `z` 1842–1967; Mexico City `z` ≈2226 m against a real altitude of ~2240 m; Las Vegas 2025 `z` 6000–6162 against ~610 m ([Spa probe](https://api.openf1.org/v1/location?session_key=9141&driver_number=1&date%3E=2023-07-30T13:05:00&date%3C=2023-07-30T13:07:00), [Mexico probe](https://api.openf1.org/v1/location?session_key=9625&driver_number=1&date%3E=2024-10-27T20:05:00&date%3C=2024-10-27T20:07:00), [Vegas probe](https://api.openf1.org/v1/location?session_key=9858&driver_number=1&date%3E=2025-11-23T04:05:00&date%3C=2025-11-23T04:07:00)).
- The absolute `z` datum is **not** stable across seasons at the same circuit: Monza `z` is 176–230 in 2023 but 1842–1967 in 2024 ([Monza 2023 probe](https://api.openf1.org/v1/location?session_key=9161&driver_number=16&date%3E=2023-09-16T13:20:00&date%3C=2023-09-16T13:22:00), [Monza 2024 probe](https://api.openf1.org/v1/location?session_key=9590&driver_number=1&date%3E=2024-09-01T13:05:00&date%3C=2024-09-01T13:07:00)).
- Degenerate sessions exist: Spa 2025 race returned 456 rows over two minutes with `x` span 0, `y` span 1 and `z` constant 4097 — frozen rows, not motion ([Spa 2025 probe](https://api.openf1.org/v1/location?session_key=9939&driver_number=4&date%3E=2025-07-27T13:20:00&date%3C=2025-07-27T13:22:00)).
- **Pit lane is included in `/location`**: samples keep arriving through a 22.2 s pit transit with no gap (151 rows in a 40 s window ≈ 3.8 Hz) and the path leaves the racing line ([pit-window probe](https://api.openf1.org/v1/location?session_key=9877&driver_number=16&date%3E=2025-10-26T20:46:30&date%3C=2025-10-26T20:47:10)). The docs never say this either way ([OpenF1 docs — Location](https://openf1.org/docs/)).
- Pit lane is also modelled in lap data: segment value `2064` is documented as "pitlane" ([OpenF1 docs — Laps](https://openf1.org/docs/)).

### 1.3 `/pit`: field semantics

- `lane_duration`: "The time spent in the pit lane, in seconds" ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- `stop_duration`: "The time the car remains stationary during a pit stop, in seconds. Available from the 2024 US Grand Prix onwards. From the 2026 season, this value may be unavailable during live sessions but is typically populated within a few hours after the session ends" ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- `pit_duration` (deprecated): "Same as 'lane_duration'. This field will be removed at the end of the 2026 season" ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- `date` is documented only as "The UTC date and time, in ISO 8601 format" — which instant it marks (entry, stop, or exit) is **UNVERIFIED** ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- Probe: at Mexico City 2025, driver 16 has `date` 20:46:37.358Z, `lane_duration` 22.215 s, `stop_duration` 2.2 s, `lap_number` 31; the car was still at racing speed at `date` and near-stationary ~15 s later, so `date` behaves like pit-lane **entry**, not the stop ([pit row](https://api.openf1.org/v1/pit?session_key=9877&driver_number=16)).
- `lap_number` is "The sequential number of the lap within the session (starts at 1)" ([OpenF1 docs — Pit](https://openf1.org/docs/)).

### 1.4 `/session_result`: DNF / DNS / DSQ

- `dnf`: "Indicates whether the driver Did Not Finish the race. This can be true only for qualifying and race sessions" ([OpenF1 docs — Session result](https://openf1.org/docs/)).
- `dns`: "Indicates whether the driver Did Not Start the race. This can be true only for qualifying and race sessions" ([OpenF1 docs — Session result](https://openf1.org/docs/)).
- `dsq`: "Indicates whether the driver was disqualified" ([OpenF1 docs — Session result](https://openf1.org/docs/)).
- `duration` is overloaded: "Either the best lap time (for practice or qualifying), or the total race time (for races), in seconds. In qualifying, this is an array of three values for Q1, Q2, and Q3" ([OpenF1 docs — Session result](https://openf1.org/docs/)).
- `gap_to_leader` is "...+N LAP(S) if the driver was lapped", and also an array of three values in qualifying; `position` is "The driver's final position at the end of the session" ([OpenF1 docs — Session result](https://openf1.org/docs/)).
- So `position` + `dnf`/`dns`/`dsq` are separate signals: a classified-but-retired driver still carries a `position` ([OpenF1 docs — Session result](https://openf1.org/docs/)).

### 1.5 `/race_control`: categories and message shape

- `category`: "The category of the event (SessionStatus, CarEvent, Drs, Flag, SafetyCar, ...)" — the trailing "..." means the list is open, not exhaustive ([OpenF1 docs — Race control](https://openf1.org/docs/)).
- `scope`: "The scope of the event (Track, Driver, Sector, ...)"; `flag`: "Type of flag displayed (GREEN, YELLOW, DOUBLE YELLOW, CHEQUERED, ...)" ([OpenF1 docs — Race control](https://openf1.org/docs/)).
- `message`: "Description of the event or action"; also `date`, `driver_number`, `lap_number`, `qualifying_phase` (1/2/3), `sector` ([OpenF1 docs — Race control](https://openf1.org/docs/)).
- Documented example row: `{"category":"Flag","flag":"BLACK AND WHITE","scope":"Driver","message":"BLACK AND WHITE FLAG FOR CAR 1 (VER) - TRACK LIMITS","lap_number":59}` ([OpenF1 docs — Race control](https://openf1.org/docs/)).
- Messages are free text from race control, so any parser must treat `message` as unstructured prose ([OpenF1 docs — Race control](https://openf1.org/docs/)).

### 1.6 `/position` (needed to cross-check any 3D ordering)

- Fields: `date`, `driver_number`, `meeting_key`, `position` ("Position of the driver (starts at 1)"), `session_key` ([OpenF1 docs — Position](https://openf1.org/docs/)).
- It is a change log, not a per-timestamp table: "Provides driver positions throughout a session, including initial placement and subsequent changes" ([OpenF1 docs — Position](https://openf1.org/docs/)).

---

## 2. OpenF1 — rate limits, license, access

- The docs page states no rate limit at all; a full-text scan of `openf1.org/docs` finds no quota, limit, or throttling text ([OpenF1 docs](https://openf1.org/docs/)).
- The real limit lives in the server source: a catch-all route decorated `@rate_limiter.limit("30/10seconds")  # 30 requests every 10 seconds per IP`, using `slowapi` keyed on `get_remote_address` ([query_api/app.py](https://github.com/br-g/openf1/blob/main/src/openf1/services/query_api/app.py)).
- Access is split by recency: "Historical data (from 2023 onwards) is free and accessible without authentication. Real-time data requires a paid subscription" ([OpenF1 docs — Introduction](https://openf1.org/docs/)).
- The repo license is Creative Commons **Attribution-NonCommercial-ShareAlike 4.0 International** — the `LICENSE` file is the CC BY-NC-SA 4.0 text itself ([LICENSE](https://github.com/br-g/openf1/blob/main/LICENSE)).
- GitHub's licensee reports this as `NOASSERTION`/"Other" because the file is the license text rather than a recognised short form — the license is still CC BY-NC-SA 4.0 by content ([license metadata](https://api.github.com/repos/br-g/openf1/license)).
- Non-affiliation is explicit: "OpenF1 is an unofficial project and is not associated in any way with the Formula 1 companies. F1, FORMULA ONE ... are trade marks of Formula One Licensing B.V." ([OpenF1 docs — Introduction](https://openf1.org/docs/)).
- Whether the CC BY-NC-SA grant extends to the *served data* (as opposed to the repo's code) is not stated on the site — **UNVERIFIED** ([LICENSE](https://github.com/br-g/openf1/blob/main/LICENSE)).
- Consequence for a non-commercial project: attribution + non-commercial + share-alike are the three obligations, and share-alike reaches derivative works built on the licensed material ([CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)).

---

## 3. Jolpica F1 — final standings for a completed season

- Driver standings: `GET /ergast/f1/{season}/driverstandings/` → "Returns a season's drivers standings from first to last place" ([driverStandings.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/driverStandings.md)).
- Constructor standings: `GET /ergast/f1/{season}/constructorstandings/` → same contract for teams ([constructorStandings.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/constructorStandings.md)).
- `season` accepts a year or `current`; adding `/{season}/{round}/` returns the table "after a specified round", and `last` is accepted ([driverStandings.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/driverStandings.md)).
- Filters compose: `/drivers/{driverId}/` narrows to one driver, and a trailing `/{finishPosition}` selects a single position ([driverStandings.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/driverStandings.md)).
- Response shape: `MRData.StandingsTable.season`, `.round`, `.StandingsLists[i].DriverStandings` — with `MRData.total`/`limit`/`offset` for paging ([driverStandings.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/driverStandings.md)).
- Live-confirmed for 2024: `total` 24, `round` "24", each entry `{position, positionText, points, wins, Driver{driverId, permanentNumber, code, url, givenName, familyName, dateOfBirth, nationality}, Constructors[{constructorId, url, name, nationality}]}` ([live call](https://api.jolpi.ca/ergast/f1/2024/driverstandings/?limit=1)).
- Constructor entries mirror it with `Constructor` instead of `Driver`: `total` 10 for 2024, e.g. `{position:"1", points:"666", wins:"6", Constructor:{constructorId:"mclaren"}}` ([live call](https://api.jolpi.ca/ergast/f1/2024/constructorstandings/?limit=1)).
- Licence: "freely available for **non-commercial use**", data under **CC BY-NC-SA 4.0**, commercial use requires contact ([TERMS.md](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)).
- A **custom User-Agent is required**: "We require a custom user agent to be set when using our API", with app name + version, e.g. `MyGreatF1App/1.2.3 FastF1/1.2.2` ([docs/README.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md)).
- Limits: burst **4 requests/second**, sustained **500 requests/hour**, unauthenticated; exceeding returns `HTTP 429` "Request was throttled"; the docs advise caching and filtered queries over per-round loops ([rate_limits.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md)).
- No uptime or correctness guarantee: "we do not guarantee uptime, availability, or correctness of the data" ([TERMS.md](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)).
- One request per season is enough for a final table — `limit`/`offset` paging exists but a full 24-driver table fits in the default page ([live call](https://api.jolpi.ca/ergast/f1/2024/driverstandings/)).

---

## 4. three.js — 20-car scene at 60 fps

### 4.1 Instancing (the primary lever)

- `InstancedMesh` exists precisely for this: "Use this class if you have to render a large number of objects with the same geometry and material(s) but with different world transformations. The usage of 'InstancedMesh' will help you to reduce the number of draw calls and thus improve the overall rendering performance in your application" ([src/objects/InstancedMesh.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)).
- Instances share one geometry+material, so per-car variety must come from per-instance matrices/colours, not from distinct meshes ([src/objects/InstancedMesh.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)).
- After `setMatrixAt`, "You have to set its `BufferAttribute#needsUpdate` flag to true if you modify instanced data" — forgetting this silently freezes the cars ([src/objects/InstancedMesh.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)).
- Culling is automatic: "The engine automatically computes the bounding sphere when it is needed, e.g., for ray casting or view frustum culling" — a stale bounding sphere can cull visible instances ([src/objects/InstancedMesh.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)).

### 4.2 Merging static geometry (track, kerbs, barriers)

- "Every Mesh you create and three.js represents 1 or more requests by the system to draw something. Drawing 2 things has more overhead than drawing 1 even if the results are the same so one way to optimize is to merge meshes" ([manual: Optimizing Lots of Objects](https://github.com/mrdoob/three.js/blob/dev/manual/pages/optimize-lots-of-objects.html)).
- Documented trade-off: "The problem with making everything one mesh though is it's no longer easy to move any part that was previously separate" — merge the static track, never the cars ([manual: Optimizing Lots of Objects](https://github.com/mrdoob/three.js/blob/dev/manual/pages/optimize-lots-of-objects.html)).
- That manual page does **not** discuss `InstancedMesh` (zero occurrences of "instanc"); instancing guidance lives in the API docs, so the two techniques must be read separately ([manual: Optimizing Lots of Objects](https://github.com/mrdoob/three.js/blob/dev/manual/pages/optimize-lots-of-objects.html)).

### 4.3 Sprite labels — and a documented caveat

- `Sprite` is "A sprite is a plane that always faces towards the camera, generally with a partially transparent texture applied" ([src/objects/Sprite.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/Sprite.js)).
- Hard caveat: "Sprites do not cast shadows, setting `castShadow` to `true` will have no effect" — driver labels can never take part in the shadow pass ([src/objects/Sprite.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/Sprite.js)).
- Because sprites always face the camera, they are screen-oriented 2D overlays, which is why they suit labels but not car bodywork ([src/objects/Sprite.js](https://github.com/mrdoob/three.js/blob/dev/src/objects/Sprite.js)).

### 4.4 Shadows

- Shadows are **off by default** (`this.enabled = false`), default type is `PCFShadowMap`, and `PCFSoftShadowMap` has been removed with a console warning ([WebGLShadowMap.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLShadowMap.js)).
- `mapSize` defaults to `(512, 512)` per light ([src/lights/LightShadow.js](https://github.com/mrdoob/three.js/blob/dev/src/lights/LightShadow.js)).
- Cost is documented: "The larger you make them the more memory they take and the slower they are to compute so you want to set them as small as you can and still make your scene work" ([manual: Shadows](https://github.com/mrdoob/three.js/blob/dev/manual/pages/shadows.html)).
- Tighten the shadow camera: "Smaller means better looking shadows so make the area as small as you can and still cover your scene", and each machine caps texture size at `renderer.capabilities.maxTextureSize` ([manual: Shadows](https://github.com/mrdoob/three.js/blob/dev/manual/pages/shadows.html)).
- Turning shadows on requires three separate flags: `renderer.shadowMap.enabled`, `light.castShadow`, and per-mesh `castShadow`/`receiveShadow` ([manual: Shadows](https://github.com/mrdoob/three.js/blob/dev/manual/pages/shadows.html)).

### 4.5 What the docs do **not** say

- No official three.js page states an fps target, a per-object budget, or a "20 cars runs at 60 fps" claim. Any such number is a **design target**, not a documented fact ([three.js docs](https://threejs.org/docs/)).
- Docs URLs are now an SPA over JSDoc-in-source; the old `/docs/api/en/...html` and `/manual/en/*.html` paths return 404, so citations must point at the repo or the fragment URLs ([three.js manual index](https://threejs.org/manual/), [docs search index](https://threejs.org/docs/search.json)).

---

## 5. Motorsport Manager — official UI reference

Sources limited to the publisher's Steam store listing and its official screenshots
(app 415200, developed by Playsport Games, published by Miniclip) ([Steam store](https://store.steampowered.com/app/415200/Motorsport_Manager/), [app details](https://store.steampowered.com/api/appdetails?appids=415200)). Layouts are described, not copied; no assets reused.

- **Real-time race day is the core loop, not a results screen.** "Feel the thrill of race day. React in real-time and make split-second decisions to gain the edge on your rivals" ([Steam store](https://store.steampowered.com/app/415200/Motorsport_Manager/)).
- **Pattern — persistent global status strip + persistent nav.** Every screen carries balance, standings, weather and "Next Race in 16 Days"; a bottom icon bar holds badge counts (mail 7, pit crew 5, sponsors 2) plus one primary `Continue` button ([screenshot: Part Fitting](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_a18ee0c707fb2b4b3bc4ba13986b38b3ea33f085.1920x1080.jpg)).
- **Pattern — header states the job.** Each screen is a title plus one imperative line, e.g. "PART FITTING / Control which parts are fitted to your cars" ([screenshot: Part Fitting](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_a18ee0c707fb2b4b3bc4ba13986b38b3ea33f085.1920x1080.jpg)).
- **Pattern — left/middle shows the object, right shows a tabbed detail panel.** Part Fitting pairs two cars symmetrically with leader lines from each part card to the car diagram, condition as red/amber/green bars, while the right panel switches Performance/Reliability and compares against a championship baseline ([screenshot: Part Fitting](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_a18ee0c707fb2b4b3bc4ba13986b38b3ea33f085.1920x1080.jpg)).
- **Pattern — race HUD layers four independent surfaces.** Left: standings table (position, tyre compound, stops, gap) with up/down change arrows; centre: 3D track camera with a *small number* of anchored nameplates; right: minimap with numbered dots; top: weather/track-grip strip ([screenshot: race](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_668dd15500da071a20cfb9e181b2b5f45b5b9895.1920x1080.jpg)).
- **Pattern — labels are selective, minimap is total.** Only two cars carry floating plates (name, fuel %, sector pace) while all 20 exist as numbered dots on the minimap — decluttering is achieved by choosing what gets a label, not by hiding cars ([screenshot: race](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_668dd15500da071a20cfb9e181b2b5f45b5b9895.1920x1080.jpg)).
- **Pattern — replay transport is a first-class control.** Pause/play plus `x2 / x4 / x12` speed buttons and a `LAP 5/16` counter sit centre-bottom, with per-driver action cards (`Pit`, `Condition`, `Strategy`) at each edge ([screenshot: race](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_668dd15500da071a20cfb9e181b2b5f45b5b9895.1920x1080.jpg)).
- **Pattern — 3D scene carries hotspots instead of modals.** The HQ view labels buildings in-scene ("DESIGN CENTRE / Max Level Reached", "TEST TRACK / Level 2 of 3") and keeps stats in a right dock ([screenshot: HQ](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_49297131e20d1919ecf867710d4c7723e823fde7.1920x1080.jpg)).
- **Pattern — consequences are chosen before and during, separately.** "Set initial strategy across practice, qualifying and race – and adjust your tactics according to on-track developments", with weather as an explicit decision input ("Will you pit for intermediate tyres or hold out on slicks") ([Steam store](https://store.steampowered.com/app/415200/Motorsport_Manager/)).
- **Pattern — risk is an explicit, priced choice.** "Risk it all with a high speed pit stop that could put you out in front of your rivals" ([Steam store](https://store.steampowered.com/app/415200/Motorsport_Manager/)).
- No claim here about the game's internal data model — only shipped UI behaviour and marketing copy are cited ([Steam store](https://store.steampowered.com/app/415200/Motorsport_Manager/)).

---

## 6. Historical telemetry coverage start year

- Official statement: "Historical data (from 2023 onwards) is free and accessible without authentication" ([OpenF1 docs — Introduction](https://openf1.org/docs/)).
- Confirmed at the API level: `/v1/sessions?year=2022` returns `HTTP 404 Not Found` (not an empty list), while `year=2023` returns 118 sessions whose earliest is `2023-02-23T07:00:00+00:00`, session_key 7763 — 2023 pre-season testing ([2022 probe](https://api.openf1.org/v1/sessions?year=2022), [2023 probe](https://api.openf1.org/v1/sessions?year=2023)).
- Coverage is **per endpoint, not per season**: `stop_duration` only exists "from the 2024 US Grand Prix onwards" ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- Team radio coverage is explicitly partial and degrading: "only a limited selection of communications are included" and "Coverage has decreased significantly starting in 2026, with most events providing no radio data at all" ([OpenF1 docs — Team radio](https://openf1.org/docs/)).
- Lap segments are not available in races at all ("Segments are not available during races"), which caps any corner-level 3D annotation in race sessions ([OpenF1 docs — Laps](https://openf1.org/docs/)).
- No OpenF1 or F1 statement extends telemetry before 2023 — the 2023 floor is the only documented one, and it matches the 404 above ([OpenF1 docs](https://openf1.org/docs/)).

---

## What this means for v4

### Facts (verified above, safe to build on)

- Position data is ~3.7 Hz, GPS-derived, ~0.1 m per unit horizontally, with an arbitrary origin and **no** lateral placement — so any track ribbon width is invented, and cars belong on the centreline ([OpenF1 docs](https://openf1.org/docs/)).
- `z` is elevation-like in the same 0.1 m unit but its zero moves between sessions/seasons, and at least one session returned frozen rows — so `z` must be normalised per session or the scene must stay flat ([Monza 2023](https://api.openf1.org/v1/location?session_key=9161&driver_number=16&date%3E=2023-09-16T13:20:00&date%3C=2023-09-16T13:22:00), [Spa 2025](https://api.openf1.org/v1/location?session_key=9939&driver_number=4&date%3E=2025-07-27T13:20:00&date%3C=2025-07-27T13:22:00)).
- Pit transit already exists in `/location`, so pit-lane animation needs no new endpoint; only the *semantics* of `date` are unknown ([pit probe](https://api.openf1.org/v1/pit?session_key=9877&driver_number=16)).
- 30 requests / 10 s per IP is the real OpenF1 ceiling — a cold 20-car race build is ~20 `/location` calls plus session calls, so the limiter is a scheduler constraint, not a blocker ([app.py](https://github.com/br-g/openf1/blob/main/src/openf1/services/query_api/app.py)).
- Final driver/constructor tables for any completed season are one cached Jolpica request each, at 4 req/s and 500 req/h ([rate_limits.md](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md)).
- Non-commercial is a hard constraint on both sources; CC BY-NC-SA 4.0 implies attribution and share-alike ([OpenF1 LICENSE](https://github.com/br-g/openf1/blob/main/LICENSE), [Jolpica TERMS](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)).
- three.js gives draw-call reduction (`InstancedMesh`, geometry merging) and explicit shadow cost knobs, but publishes no fps guarantee ([InstancedMesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js), [Shadows](https://github.com/mrdoob/three.js/blob/dev/manual/pages/shadows.html)).

### Design choices (ours to make, not documented)

- **Cars:** one `InstancedMesh` for 20 bodies (single low-poly geometry, per-instance matrix + colour) rather than 20 meshes; update matrices in the replay loop and set `instanceMatrix.needsUpdate` ([InstancedMesh](https://github.com/mrdoob/three.js/blob/dev/src/objects/InstancedMesh.js)).
- **Track:** merge all static geometry (ribbon, kerbs, barriers, ground) into one mesh and never merge the cars ([manual](https://github.com/mrdoob/three.js/blob/dev/manual/pages/optimize-lots-of-objects.html)).
- **Labels:** sprites for a small selected set of cars, mirroring Motorsport Manager's selective plates, and accept that they never cast shadows ([Sprite](https://github.com/mrdoob/three.js/blob/dev/src/objects/Sprite.js), [race screenshot](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_668dd15500da071a20cfb9e181b2b5f45b5b9895.1920x1080.jpg)).
- **Shadows:** keep them off by default (matching the documented default), opt in per session with a small `mapSize` and a tight shadow camera; treat any quality/perf trade-off as measured, not assumed ([WebGLShadowMap.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLShadowMap.js), [Shadows](https://github.com/mrdoob/three.js/blob/dev/manual/pages/shadows.html)).
- **60 fps:** adopt it as a target with a measured budget (draw calls, triangles, shadow passes), since no official source promises it ([three.js docs](https://threejs.org/docs/)).
- **Game layer:** model replay transport as a first-class control (`x0.5…x12`, pause, lap counter) and keep the standings table as the always-visible truth list beside the 3D view — both are shipped patterns in the reference game ([race screenshot](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/415200/ss_668dd15500da071a20cfb9e181b2b5f45b5b9895.1920x1080.jpg)).
- **Pit decisions:** expose `lane_duration` vs `stop_duration` as the cost surface (the loss you can control vs the loss you cannot), and do not pretend `date` marks the stop until it is verified ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- **Elevation:** either render flat (honest, matching v3) or normalise `z` per session with a visible "vertical exaggeration" disclosure — never mix raw `z` across seasons ([Monza 2023](https://api.openf1.org/v1/location?session_key=9161&driver_number=16&date%3E=2023-09-16T13:20:00&date%3C=2023-09-16T13:22:00), [Monza 2024](https://api.openf1.org/v1/location?session_key=9590&driver_number=1&date%3E=2024-09-01T13:05:00&date%3C=2024-09-01T13:07:00)).

### Open items to resolve before building

- **UNVERIFIED:** units and axis convention of `/location` (inferred 0.1 m from path length and known relief, never stated upstream) ([OpenF1 docs](https://openf1.org/docs/)).
- **UNVERIFIED:** what instant `/pit.date` represents (probe suggests pit entry) ([OpenF1 docs — Pit](https://openf1.org/docs/)).
- **UNVERIFIED:** whether CC BY-NC-SA covers served data, not just the repo ([LICENSE](https://github.com/br-g/openf1/blob/main/LICENSE)).
- **UNVERIFIED:** why some sessions return frozen `/location` rows; a per-session sanity check (distinct positions, non-zero variance) is the mitigation ([Spa 2025 probe](https://api.openf1.org/v1/location?session_key=9939&driver_number=4&date%3E=2025-07-27T13:20:00&date%3C=2025-07-27T13:22:00)).
- Repo cross-check: [analysis.py:77](../analysis.py) and [analysis.py:92](../analysis.py) already assert "z is elevation" and "roughly 10x" — the first is only *relatively* true, which is worth fixing in code comments when v4 touches that path.
