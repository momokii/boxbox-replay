# V3.6 — Championship standings and the results archive: research

**Question.** Can BoxBox add season standings and a pre-2023 results archive
using free data, without mixing eras into the telemetry replay or fabricating
missing rounds?

**Short answer.** Yes. Jolpica F1 is the maintained, free successor to Ergast:
results/standings from 1950, non-commercial use under CC BY-NC-SA 4.0, with a
custom User-Agent and cached requests. Standings and archive are separate from
the OpenF1 replay; no telemetry exists before 2023, so the archive says so.

## 1. Licence and limits (Jolpica F1)

The project's Terms of Use say: "The API is freely available for
**non-commercial use**", the data is "licensed under Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)", and
commercial use requires contact. The docs also require a custom User-Agent and
state the unauthenticated limits: **4 requests/second**, **500 requests/hour**,
with a 429 on abuse and no uptime guarantee
([Terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md),
[rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md),
[API docs](https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md)).

BoxBox is non-commercial and displays the source/licence in the UI. The adapter
sends `BoxBoxReplay/3.6.0`, caches each response for one hour, enforces 4/s and
500/h, and never redistributes database dumps.

## 2. Why Jolpica for both features

OpenF1 also has beta championship endpoints. They return `points_start` and
`points_current` for **one session**, which is enough for a snapshot but not a
round-by-round season chart; building a season would require one request per
race session and would still be limited to 2023+. Jolpica exposes a standings
table per round, so one cached request per round builds the progression and the
same adapter serves the archive. OpenF1 remains the only telemetry/replay
source.

## 3. What each surface shows

- **Standings tab (session context).** Resolve the current weekend to a
  championship round by exact race name, then nearest date within 10 days
  (OpenF1 meeting names and Jolpica race names do not always match, and 2026
  has duplicate/renamed events). Show the driver/team table after that round and
  a points-by-round chart for the top five. If no round matches, say so; do not
  guess.
- **Results archive (separate surface).** 1950–2022 only. Season → race →
  results, with final driver standings beside them. Every view states: no
  telemetry or replay for this era. Missing result sets show "No results are
  stored for this round"; a source outage shows a retry message.

## 4. Fallbacks and honesty

- Jolpica 404/empty payload → empty list, never an invented result or points.
- Source failure → API 503 + UI retry; no silent fallback to a different season.
- Season progression skips a round with no data instead of inserting zeros.
- Round matching is explicit; a mismatch is displayed, not approximated.
- Results/standings are a separate data layer; the replay picker still starts in
  2023 and never offers a fake archive replay.

## 5. Decision

Ship **V3.5b + V3.5c** in one v3.6 release: a shared `jolpica.py` adapter,
`/standings`, `/standings/progression`, `/archive/seasons`,
`/archive/{year}/races`, `/archive/{year}/{round}/results`, a **Standings** tab,
and a full-screen **Archive** view. Attribution is part of both surfaces.

## Sources

1. Jolpica Terms of Use — free non-commercial, CC BY-NC-SA 4.0:
   <https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md>
2. Jolpica rate limits — 4/s, 500/h, custom User-Agent:
   <https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md>
3. Jolpica endpoint documentation:
   <https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md>
4. OpenF1 API docs — historical data free from 2023; championship endpoints are
   beta and session-scoped:
   <https://openf1.org/docs/>

> v3.7 extends the archive to every available season through 2026 and adds
> checked-time/Refresh plus explicit loading states. See `V3_7_RESEARCH.md`.

## Implementation result (2026-11-15)

- `jolpica.py`: read-through JSON cache (one hour), custom User-Agent, 4 req/s +
  500 req/h, retries on 429/5xx, empty data never cached.
- API: `/standings`, `/standings/progression`, `/archive/seasons`,
  `/archive/{year}/races`, `/archive/{year}/{round}/results`; 422 on bad
  year/round, 503 with a retry message when Jolpica is down.
- UI: a **Standings** tab in the session (round resolved by race name/date,
  driver/team tables, top-five progression chart) and a separate **Archive**
  full-screen view for 1950–2022. Both show source and licence.
- Fallbacks verified: 1950 results render with shared drives/retirements; a
  round without results says so; a source outage shows retry; progression skips
  a round with no data and carries a driver's points forward.
- Tests: 87 pytest (including Jolpica parsing, empty data, missing round and
  carry-forward) and 68 vitest; Playwright covers standings, archive, 3D,
  mobile and offline.
