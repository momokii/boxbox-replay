# v3 close-out

BoxBox Replay v3 is complete through **v3.13.0**. This is the final state of the
v3 milestone: a free, historical F1 replay product with analysis, comparison,
standings, archive, reporting and an optional 3D view. It is not a live-timing
product and does not claim to be one.

## Shipped surface

| Area | What v3 added |
|---|---|
| Strategy | Transparent stay-vs-pit projection, clean-lap filtering, measured pit loss, assumptions, break-even, undercut, recommendation and grounded explanation |
| Telemetry | Same-clock multi-driver traces, Replay/Fixed/Full-session scopes, hover readout, scoped AI comparison |
| Comparison | Distance-aligned Lap Duel with full A/B traces and throttle/brake/gear/DRS; Battle current inputs and lap snapshots |
| Performance | Timeline, stint definitions, pit-crew/outlier analytics, qualifying mini-sectors with Detail/Overall |
| Season | Championship standings with selectable series, round tooltips, head-to-head and checked-time Refresh |
| Archive | Results and standings through the latest available season, with explicit loading and missing-data states |
| Export | Session-wide Download data (9 tables) as CSV/JSON and a printable Data/AI session report |
| Experience | Full/Focus/Data layouts, offline cache, corrected share card, driver headshots, on-demand hover speed, dark/light theme |
| 3D | Optional lazy three.js replay with procedural cars, asphalt, start/corners, orbit and click-to-select; 2D remains default |

## Architecture and boundaries

- **Data:** OpenF1 is the replay/telemetry source; Jolpica supplies results and
  standings. Both are free/non-commercial; Jolpica is CC BY-NC-SA 4.0 with
  attribution. No paid/live feed is used.
- **Backend:** `api/main.py` is a deliberately thin HTTP layer over pure
  `analysis.py`/`strategy.py`, cached `data_loader.py`, `ai.py`, `coach.py`,
  `jolpica.py` and `ratelimit.py`. Server-built facts are the source of truth.
- **Frontend:** one SPA; pure helpers for windows, exports, playback and share
  cards. The large surfaces (Report, Download, SessionMap) are isolated
  components, and the 3D renderer is a lazy chunk with a 2D fallback.
- **Operations:** two containers, nginx same-origin proxy, CSP/security headers,
  non-root API, cache volume, pinned dependencies, CI tests plus secret and
  dependency scans.

## Known limits and deliberately deferred items

- **AI quota:** the OpenCode Go allowance is finite and can return 429. The UI
  says so; the data/analysis surfaces remain usable. No key is sent to the browser.
- **Cold replay:** ~20 per-driver OpenF1 calls at 30/minute. The app shows
  progress and cancels stale builds; the free budget is not bypassed.
- **Data gaps:** some feeds have missing speed/stationary-stop channels. The UI
  shows `—`/an explicit empty state and the AI is told not to fill gaps.
- **PDF:** “Print / Save PDF” uses the browser’s print destination, not a
  server-side PDF renderer.
- **Jolpica share-alike** applies to the archive data; the app is non-commercial
  and attributes it.
- **V3.5b (Jolpica 1950+ archive expansion) and V3.5c (championship progression
  beyond the current round)** were considered and closed in D8/D9; the standings
  feature covers the current season, while the archive deliberately stays
  results-only. 3D is an optional view, not the analysis surface.
- **V3.5a 3D** is flat and uses a visual ribbon width; no elevation or measured
  track width is invented.

## Verification baseline

- 93 pytest + 74 vitest
- ruff, tsc, Vite build, oxlint (warnings only), gitleaks history, pip-audit,
  production npm audit
- Browser: replay/progress/cancel, Battle, Duel, Telemetry, Performance, Pit
  Wall, Strategy, Ask, Standings, Archive, Report, Download, offline, mobile,
  3D fallback, hover speed
- CI green on the release commit; deployment health checked separately.
