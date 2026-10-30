# Feature plan v1 — what this app should do next

Written before touching code. Goal: make the replay more informative **without**
adding anything the data cannot support, and without risking the parts that work.

## Research

Primary sources: OpenF1's own API (queried directly, which is the truth the docs
describe), plus the feature set of the reference tools in this space
(MultiViewer's pit-wall view, F1 live timing). Findings:

- We already use: sessions, meetings, drivers, laps, location, car_data,
  intervals, stints, weather, team_radio, race_control.
- **Unused but available** (verified on Suzuka 2024, session 9496):

| Endpoint | Rows | Fields | Why it matters |
|---|---|---|---|
| `pit` | 54 | `lap_number, pit_duration, stop_duration, lane_duration` | Real pit stops: count, stationary time, when they happened |
| `position` | 443 | `date, driver_number, position` | **Official** classification over time, authoritative where gaps are missing |
| `overtakes` | 236 | `overtaking_driver_number, overtaken_driver_number, date, position` | On-track action; per-driver overtakes made/lost |
| `session_result` | 20 | `position, points, dnf, duration, gap_to_leader` | Final classification and points |
| `starting_grid` | 0 | — | Not populated for this session → skip |

Data-quality notes found while inspecting: `pit_duration` includes lane time and
carries red-flag artifacts (first row 1575 s); `position` rows start before the
session; both need the same clamping/time-zeroing as the rest of the feeds.

## What we will add (in this order, one commit each)

1. **Data layer + API** for pit stops, official positions, overtakes and session
   result — cached, clamped to the session window, zeroed at lights out, with
   pure helpers and tests (pit-stop summary, overtake counts, position lookup).
2. **Official position ordering** in the timing tower: position from the feed
   when available, gap-ordered fallback when not. Correctness improvement for
   sessions where gaps are sparse, with a visible label of which source is used.
3. **Pit stops on the stint timeline** + a pit-stop summary (count, best stop,
   total) in Performance, and last-stop detail in the Pit Wall.
4. **Overtakes**: made/lost per driver in the driver card, plus the most recent
   overtakes around the playhead in the battle panel.
5. **Session result** line in the session facts (finish position, points, DNF).
6. **Shareable moment**: `?t=` in the deep link plus a "Copy link to this moment"
   button, so a replay can be shared at an exact time.

## Non-goals (deliberately not doing)

- No new visual language, no layout changes to the working replay screen.
- No feature that fabricates data. If a feed is empty, the UI stays silent.
- No new dependency. No change to deployment shape.

## Verification per step

- `pytest` + `ruff` for the API, `vitest` + `tsc` for the web.
- Screenshots of every touched screen, night and day, 1440 px and 390 px.
- Playback frame-timing check after UI work (must stay at 60 fps).


## Finding while implementing (important)

`/position` and `/intervals` disagree on purpose: the position feed follows
**physical track order**, while `gap_to_leader` is **classification** order. A
car that has just pitted is physically ahead of cars yet classified behind. The
tower therefore stays **ordered by classification gap** (matching the gaps it
prints) and numbers itself, with the position feed used only as a tie-break when
a driver has no gap. Retired cars are classified last and labelled DNF, never
sorted by a stale gap.


## Shipped (verified)

| # | Feature | Where |
|---|---|---|
| 1 | Pit-stop data (count, best/total stop time, lap numbers) | `GET /session/pit`, Performance, Pit Wall, driver card |
| 2 | Official position feed as tie-break + retired-car labelling | tower (DNF/DNS/DSQ last, no stale gaps) |
| 3 | Pit-stop notches on the stint timeline | Performance → Stints |
| 4 | Overtakes made/lost per driver, and passes between the two battle drivers | driver card, Battle |
| 5 | Final classification (position, points, DNF) | session facts + driver card |
| 6 | Shareable moment: `?t=` deep link + "Copy link to this moment" | player bar |
| 7 | Lap-time evolution chart with hover | Performance |

All additive: no layout was moved, and every block hides itself when its feed is
empty.
