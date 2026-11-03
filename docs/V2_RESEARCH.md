# BoxBox Replay — v2 research and scope

Researched 2026-11-03. Every limit and licence claim below was read from the
source that owns it; every size/timing number was measured against the live
OpenF1 API from this host on the same day.

## TL;DR

- **v1 is feature-complete for a portfolio piece** but was never tagged. Tag
  `v1.0.0` before starting v2 so the shipped state is retrievable.
- **v2 needs no new paid data source.** Everything proposed below runs on the
  OpenF1 historical feed we already use.
- The free tier's **30 requests/minute** is the real constraint, not CPU or
  bandwidth. A cold session build is already ~30 requests, so ~60 s is a
  *floor*, not a slow day. v2 must add a real token bucket before it adds
  features.
- Recommended v2 headline: **Lap Duel** (two laps racing on the map with a live
  delta), **Telemetry traces** (throttle/brake/gear/DRS), **Fight Finder**
  (automatic battle detection from the gap feed).

---

## 1. What v1 is

Shipped and verified: session picker, full-field replay map, timing tower,
gaps, speed, lap table, battle view, performance/degradation, pit wall, race
control, weather, driver drill-down, shareable moments, day/night themes,
reduced motion, 54 backend + 45 frontend tests, CI green on both stacks.

No git tag exists (`git tag -l` is empty). The portfolio claim "v1" is true in
docs, not in the repository's history — worth fixing with an annotated tag.

## 2. Data source audit

| Source | What it provides | Free? | Limits | Licence / terms | Verdict |
|---|---|---|---|---|---|
| [OpenF1 historical](https://openf1.org/) | 18 endpoints, sessions since 2023, ~3.7 Hz car data and location | Yes, no auth | **3 req/s and 30 req/min**, per IP | Non-commercial: education, personal projects, fan engagement; contact for other use | **Keep — primary source** |
| OpenF1 live (/MQTT/WebSocket) | Live timing ~3 s behind broadcast | **No — €9.90/month sponsor tier** | 6 req/s, 60 req/min | Same, sponsor tier | **Exclude** (not free) |
| OpenF1 `championship_drivers`, `championship_teams` (beta) | Points/positions before and after each session | Yes | Same as OpenF1 | Same | Optional, beta |
| [Jolpica-F1](https://github.com/jolpica/jolpica-f1) (Ergast successor) | Results, standings, qualifying, pit stops, 1950→today | Yes, no auth | **4 req/s, 500 req/h** | **CC BY-NC-SA 4.0**, non-commercial | Optional second source only |
| [f1-circuits](https://github.com/bacinger/f1-circuits) | Circuit outlines as GeoJSON, 40 circuits | Yes (static) | None (git) | **MIT** | Optional polish |
| FastF1 | Python wrapper over F1's own timing feed | Library is free | n/a | F1 data rights are not ours to redistribute | Not needed |
| Official F1 live timing | The real thing | No | n/a | Licensed, no public API | **Exclude** |
| Team radio audio | OpenF1 `team_radio` links to F1-hosted clips | Links are free | n/a | Audio is F1 content; OpenF1 docs note 2026 often has **no radio at all** | **Exclude** for a public demo |

Conclusion: OpenF1 historical is the only source we need, and its non-commercial
terms fit a portfolio deployment (no ads, no paywall).

## 3. What the free tier actually costs (measured)

Session 11396 (2026 United States GP, Race), driver 12:

| Request | Payload | Time |
|---|---|---|
| `car_data`, whole session, one driver | 5.9 MB | 7.3 s |
| `location`, whole session, one driver | 4.6 MB | 35.3 s (cold) |
| `location`, 100 s window, one driver | 48 KB | 1.2 s |
| `car_data`, 100 s window, one driver | 64 KB | 1.8 s |
| `laps`, whole session, one driver | 26 KB | 2.6 s |
| `intervals`, whole session, one driver | 30 KB | 4.3 s |
| `location`, no `driver_number` filter | — | **HTTP 422** |

- **Location cannot be fetched for all drivers at once** — the driver filter is
  mandatory, so a full-field replay costs 20 requests by construction.
- Cold build ≈ 30 requests (20 location + sessions/drivers/laps/stints/
  intervals/weather/pit/position/overtakes/race_control/result/radio), and the
  opening screen fires ~13 more in parallel.
- At 30 req/min that is **≥62 s for a cold build**, which is exactly the "about
  a minute" the UI already promises. It is rate-limit bound, not slow code.
- The current throttler spaces calls 0.4 s apart = **150 req/min**, five times
  the documented budget. 429s are absorbed by retries, which is why the problem
  looks like latency rather than an error.

**v2 prerequisite:** replace the fixed gap with a token bucket (3/s, 30/min),
single-flight the build per session, and queue user-triggered fetches ahead of
background work. Otherwise two uncached sessions opened at once will fail.

## 4. Field facts that decide what is buildable

- `car_data` (~3.7 Hz): `speed`, `rpm`, `n_gear`, `throttle`, `brake`, `drs`.
  Measured a 100 s window = 370 samples, 64 KB.
  `brake` is `0`, `100` or `104` — treat `>= 100` as pressed.
  `drs` is populated in 2024 (`0/1/2/8/12/14`) but was `null` throughout the
  2026 sample — any DRS indicator must degrade to "—".
- `laps`: `duration_sector_1..3`, `i1_speed`, `i2_speed`, `st_speed` (speed
  traps), and `segments_sector_1..3` (mini-sector status: 2048 yellow, 2049
  green, 2051 purple, 2064 pit lane).
- **Mini-sector status is not usable in races.** The docs say so explicitly,
  and the data agrees: in the race sample 1035 of 1197 segment values (86%)
  were "yellow" placeholders, while the same meeting's qualifying session had a
  real mix of green and purple. A mini-sector feature must be qualifying-only or
  derived from `location` instead.
- `location`: x/y/z only, no lateral placement, mandatory driver filter.
- `championship_drivers` / `championship_teams` (beta): `points_start`,
  `points_current`, `position_start`, `position_current` per session.
- `team_radio`: sparse in 2026 per OpenF1's own docs.

## 5. Feature evaluation

Scores are 1–5. "Touchable" means the user operates it directly in the first
minute, not reads a table.

| # | Feature | Visible | Touchable | Data ready | Effort | Risk |
|---|---|---|---|---|---|---|
| A | **Lap Duel** — two laps on the map at once, live delta bar | 5 | 5 | Location lap windows (48 KB each) | M | Alignment maths |
| B | **Telemetry traces** — throttle/brake/gear/speed per lap | 5 | 5 | `car_data` already cached per driver | S | DRS nulls |
| C | **Fight Finder** — auto-detect battles, jump to them | 4 | 4 | `intervals` already cached | S | Threshold tuning |
| D | **Pit strategy Gantt** — stints on a shared lap axis | 4 | 3 | `stints` + `pit` already cached | M | None |
| E | **Share card** — export the current frame as PNG | 4 | 3 | None (canvas) | S | Fonts in canvas |
| F | Qualifying mini-sectors | 5 | 4 | Real segments, **quali only** | M | Sessions without segments |
| G | Speed-trap leaderboard | 3 | 2 | `st_speed`, `i1/i2_speed` | S | None |
| H | Season standings view | 3 | 2 | Jolpica (2nd source, CC BY-NC-SA) | M | Licence mixing |

## 6. Recommended v2 scope

**Headline (the "major update"):**

1. **Lap Duel.** Pick two drivers and a lap each (default: each driver's
   fastest). Both cars run on the map simultaneously, interpolated by distance
   along the outline, with a centre delta bar showing who is ahead and by how
   much. Winner state at the line, sector split summary underneath.
   Data: two `location` lap windows per driver (48 KB each), cached.
   Acceptance: delta is 0.000 at the start line, matches sector sums within
   0.05 s, and the winning side never flickers on a paused frame.

2. **Telemetry traces.** A strip under the map for the followed driver: speed,
   throttle and brake traces plus a gear/DRS readout, moving with the replay
   clock and switching to lap view in the lap modal.
   Data: `car_data` lap windows, already cached for the speed panel.
   Acceptance: traces line up with the speed chart's peak within one sample;
   `null` DRS renders "—", never a fake state; reduced-motion still animates
   the clock but not the traces.

3. **Fight Finder.** A "Fights" list built from `intervals`: any pair within
   1.0 s for two consecutive samples, scored by how long it lasted and how
   often the order changed. Clicking one seeks there and opens the battle view
   with that pair loaded.
   Data: `intervals`, already cached; computed server-side once per session.
   Acceptance: no fight listed that the gap data does not support; each entry
   seeks to a frame where both cars are within 1.5 s.

**Supporting (small, high value):**

4. **Pit strategy Gantt** — stints as bars on the lap axis, compound colour,
   pit windows marked, hover for tyre age and gap.
5. **Share card** — 1200×630 PNG of the current frame with session, lap, time
   and selected drivers; no server work.

**Stretch, only if the base lands:** qualifying session support with real
mini-sector strips (F). It needs session-type detection and a second data path,
so it is not part of the core v2.

**Deferred:** H (a second API and a share-alike licence for a table nobody
touches), G (a static leaderboard), and everything rejected in §7.

## 7. Rejected, and why

- **Live mode** — OpenF1 gates live data behind €9.90/month. A portfolio demo
  cannot promise a live session on demand anyway (races happen weekly, at
  night, in other time zones). Revisit only if there is a reason to pay.
- **Team radio playback** — audio is F1 content, and OpenF1 documents that 2026
  sessions often return no radio at all. Building on it would create a feature
  that is empty half the time and legally murky.
- **Official F1 timing / FastF1 as a source** — no public licence; FastF1 is a
  client, not a data grant.
- **Corner names** — no freely licensed dataset; our curvature labels stay
  explicitly indicative.
- **Video/onboard clips** — rights and bandwidth, out of scope.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 30 req/min shared by all visitors | Cold builds fail under concurrency | Token bucket + single-flight + prewarm the demo sessions |
| Beta championship endpoints change | Optional feature breaks | Isolate behind one adapter; never in the critical path |
| Durability of lap alignment in a duel | Wrong delta undermines trust | Align on distance along the detected centreline, not on timestamp; unit-test with synthetic traces |
| DRS nulls in some sessions | Missing indicator | Render "—"; never infer a DRS state |
| Scope creep into quali mode | v2 never ships | Qualifying is stretch, gated on the three headline features passing |

## 9. Open questions

1. Tag and publish `v1.0.0` now, or after v2?
2. Is qualifying in scope for v2, or is the product race-only?
3. Should the demo deployment prewarm a fixed set of races (which ones)?
