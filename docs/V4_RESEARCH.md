# V4 research — 3D truth, pit/retirement status, and BoxBox Grid

**Status:** research complete enough to implement; sources checked 2026-11-21.

## 1. What the sources actually support

### OpenF1 location

The official OpenF1 docs say `/location` is the **approximate** position of cars at
about **3.7 Hz**; it **lacks lateral placement** (left/right of the track) and
its `(0,0,0)` origin is **arbitrary**, not tied to a specific point on the
circuit ([OpenF1 docs](https://openf1.org/docs/)).

Consequences:

- The centreline is real enough to animate along.
- Track **width** is not in the feed. It stays a visual constant.
- A **metrically exact** pit lane cannot be reconstructed from `location`; a
  recorded transit can be shown as an approximate guide, with a schematic
  fallback. The docs do not promise lateral placement.
- Elevation is not required for this pass; no fake hills.

The existing v3 view already states the first two points in its caption. V4
must keep that honesty while making the scale and status much clearer.

### OpenF1 pit

`/pit` is documented as information about **cars going through the pit lane**
([OpenF1 docs](https://openf1.org/docs/)). The fields observed in the cached
2026 Canadian GP are:

| field | example | use |
|---|---|---|
| `date` | `2026-05-24T20:50:16.912Z` | event clock, converted to replay `t` |
| `lap_number` | `31` | event context |
| `stop_duration` | `3.4` | stationary time; may be null |
| `lane_duration` | `25.153` | pit-lane duration |
| `pit_duration` | `25.153` | pit-lane duration in this feed |

The docs do not define a lateral pit path. **Decision:** use a short recorded
pit transit as an approximate guide when the feed supplies one; otherwise show
an explicitly schematic guide. Never claim the lane width is measured.

### OpenF1 result / retirement

`/session_result` is the classification after a session, published after the
official results ([OpenF1 docs](https://openf1.org/docs/)). Observed fields:
`position`, `number_of_laps`, `dnf`, `dns`, `dsq`, `duration`,
`gap_to_leader`.

For the cached 2026 Canadian GP:

- 22 entries
- 5 `dnf` (cars 11, 1, 63, 14, 23)
- 1 `dns` (car 41)
- 16 classified finishers

The `/location` feed keeps returning the same parked coordinates for those
retired cars until the end of the session. That is exactly why the current
map can show a car that is no longer in the race. V4 must calculate an
**exit clock** from the result and the driver's last lap, then stop drawing the
car from that point. “DNF” in the final result is not the same as “DNF since
lights out”.

### OpenF1 race control

`/race-control` provides session status, incidents, flags and safety cars
([OpenF1 docs](https://openf1.org/docs/)). Messages are not spatial and do not
always name a collision explicitly. **Decision:** surface the latest relevant
message as a race-control ticker; do not place a collision marker at a corner
that the feed does not provide.

### OpenF1 limits / history

- Free tier: 3 requests/second and 30 requests/minute, enforced by the app’s
  shared bucket ([project README](../README.md), `data_loader.py`).
- The repository already treats OpenF1 telemetry as starting in 2023; the
  results archive is separate and starts in 1950.
- The app’s rate-limit and replay-progress work is unchanged.

### Jolpica / final standings

Jolpica is the repo’s results/standings archive. Its terms are **CC BY-NC-SA
4.0**, non-commercial, with attribution and a custom User-Agent
(`jolpica.py`; [license](https://creativecommons.org/licenses/by-nc-sa/4.0/)).
The existing `/standings?year=` endpoint returns the final driver and
constructor tables for completed seasons; for the current season it returns
the table after the latest round. The game must label that distinction.

### three.js

The current lazy three.js chunk is the right base: one renderer, one track
ribbon, low-poly cars, capped DPR. For V4 the scene can stay small (one ribbon,
kerbs, ~20 cars, a recorded/schematic pit guide and a minimap). No new paid asset or
model is required; procedural geometry keeps the license clean. official docs:
[WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer),
[BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry).

### Reference: Motorsport Manager

The official store description frames it as a management game: hire drivers,
build cars, manage a team, race weekend
([Steam](https://store.steampowered.com/app/415200/Motorsport_Manager/)).
The useful reference is the **race-weekend loop and player markers**, not its
assets or exact layout:

1. A clear setup → qualifying → race → result loop.
2. Drivers are the unit of selection, with visible form/team identity.
3. The player can watch the field, not just read a table.
4. Player entries need a persistent badge so local multiplayer is readable.
5. The simulation needs an explicit model, not a hidden “real result”.

No Motorsport Manager asset, text, screenshot or proprietary layout is copied.

## 2. Data facts that drive the design

- A DNF car can remain in `/location` after retirement. Hide it after the
  calculated exit clock; keep its result visible in the tower/status list.
- Pit stop `stop_duration` can be null even when `pit_duration` exists
  (`pitstats.ts` already handles this). Do not invent a stationary time.
- `location` cannot tell us which side of the track a car is on. The 2D/3D
  centreline and a constant visual width are the honest limits.
- The current 3D car mesh is 2.4 world units long against a 4.8-unit track
  width, while the world span is 100. The car is therefore roughly eight times
  too large relative to the circuit. V4 sets the car and track width to
  realistic relative dimensions and adds a **Follow** camera so the smaller car
  remains readable.
- The current 3D draws every entry in `drivers.data`, regardless of result.
  That is a correctness bug, not just visual polish.

## 3. Decisions

### 3.1 3D scale and cameras

- Use a **true relative car/track** ratio: a 5.6 m car on a 12 m-wide track,
  scaled into the 100-unit circuit world. Width remains a stated visual
  constant because OpenF1 does not provide it.
- Three camera modes:
  - **Overview** — whole circuit; cars are real relative size, so they are
    small. This is context, not a close-up.
  - **Follow** — tracks the selected (or leading) car from behind; the default
    because it shows the new car/track proportions.
  - **Free** — orbit/zoom for inspection.
- A **minimap** keeps the whole field visible while following.
- No fake elevation, no fake lateral pit path, no landscape geometry claimed
  as measured.

### 3.2 Pit lane and retirement

- Draw a **recorded short pit transit** when the feed supports one, labelled
  “recorded transit (approximate)”. If it is absent or too long, fall back to a
  clearly labelled schematic guide. It orients the viewer and hosts real
  pit-event rings; it is never presented as measured lane width.
- Compute `outAt` for each retired/DNS entry from the final result plus last
  lap data. Hide the car from that replay time. Show a status rail:
  `DNF · last lap 40`, `DNS`, `DSQ`.
- Race-control messages are a ticker, not a spatial marker.
- 2D gets the same retirement filter and recorded/schematic pit guide.

### 3.3 BoxBox Grid

- Scope: **2023–2026** circuits, because those are the seasons with OpenF1
  circuit geometry. The archive remains results-only for 1950+.
- Stats:
  - Completed season: final Jolpica driver + constructor standings.
  - Current season: standings after the latest round, labelled “current table”.
  - Driver form = 58% points + 42% position (normalized within the field).
  - Team form = constructor points normalized.
  - Overall = 64% driver form + 36% team form.
- Game model:
  - Local, 1–4 players; one driver per person; no duplicate driver.
  - 3 / 5 / 10 laps.
  - Qualifying can run or be skipped. Skipping still runs the same seeded
    qualifying model; it is not a uniform random grid.
  - Race pace is seeded and influenced by overall; the result is a game
    model, never presented as a real-world prediction.
  - No tyre, pit-stop, collision or reliability model in v1; those are stated
    omissions, not hidden claims.
- The circuit canvas uses the real OpenF1 outline. The simulation is local and
  deterministic for a given seed.

## 4. Out of scope for v4

- Measured pit-lane geometry, elevation, or lateral car placement.
- Historical pre-2023 circuit geometry in the game.
- Server-side game state, online multiplayer, accounts or leaderboards.
- AI predictions for the game.
- A full racing physics/collision engine.
