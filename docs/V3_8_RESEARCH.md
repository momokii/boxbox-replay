# V3.8 — Selectable windows, comparison modes and share-card repair

**Question.** How should the lab/duel/battle windows be scoped, how can the
strategy and mini-sector views be made understandable to non-F1 users, and what
is actually wrong with the share card?

## 1. Driver images

OpenF1's `/v1/drivers` docs list a `headshot_url` field ("URL of the driver's
face photo"), and the live response for the Canadian GP contains real URLs such
as `https://media.formula1.com/.../lannor01.png.transform/1col/image.png`
([OpenF1 driver docs](https://openf1.org/docs/), sampled 2026-11-15). The URL
returns an image, but it is hosted by Formula 1, not by OpenF1; the OpenF1 data
licence does not automatically grant rights to the photograph. Jolpica exposes
only a Wikipedia `url`, not a headshot.

**Decision.** Yes, the free feed supplies a headshot URL. Use it as a remote,
lazy image with a graceful number/initials fallback; never rehost or cache the
image, and never let a missing photo break the driver card. The image rights
remain with F1.

## 2. Telemetry windows

The lab currently receives the **current leader-lap window** from the replay.
That is stable only while the replay stays in one lap; it jumps when the replay
crosses a lap boundary. The backend `/session/telemetry` already accepts an
arbitrary session-time `t0`/`t1`.

**Decision.** Add an explicit scope selector:

- **Replay lap** — follow the current replay lap (default).
- **Fixed lap** — choose a lap from the replay's lap markers; the window becomes
  that lap's start→next-lap start, independent of playback.
- **Full session** — 0 → session duration.

The label must say that lap windows use the replay's leader-lap markers; exact
driver lap boundaries can differ by a few tenths.

## 3. Battle snapshots

Battle currently always mirrors the replay clock. This is correct for “now”, but
it makes it impossible to hold a battle still while reading it.

**Decision.** Keep **Follow replay** as default; add **Lap snapshot** with a lap
selector and an explicit **Back to replay** action. The snapshot freezes all
Battle calculations (gaps, pace, inputs) at the selected lap's marker; it does
not move the main playback.

## 4. Mini-sector overall/detail

The detail view has ~7 mini-sector cells per sector. OpenF1 documents 2048
yellow, 2049 green, 2051 purple, 2064 pitlane, and 0/2050/2052/2068 as
unavailable/unclear; segments are only available outside races
([OpenF1 docs](https://openf1.org/docs/)).

**Decision.** Add a **Detail / Overall** toggle. Detail keeps the per-mini-sector
ticks. Overall collapses each sector to one cell whose colour is the best
available status in that sector, with the sector time and a tooltip listing the
counts; it is a summary, not a new timing claim.

## 5. Strategy for non-F1 readers

The current copy explains “model from lap”, but the page still reads like a
model report. Add a plain-language recommendation banner (“At lap 58 the model
prefers staying out…”) and an explicit “pit stop costs seconds, fresh tyres are
faster” sentence; keep break-even/undercut as secondary details with their Info
tooltips. State clearly that this is a projection, not a live pit wall.

## 6. Share card bug

The card draws the circuit outline **after** the backend has rotated it, but the
car coordinates are passed raw and never rotated. In the Barcelona capture the
cars therefore fall below the track and overlap the footer. The fix is to apply
the same `-(angle)` rotation to car coordinates inside `drawShareCard` before
the layout transform. The card layout maths remain testable; a regression test
pins the rotation.

## Sources

1. OpenF1 `/drivers` documentation and sample: `headshot_url`, no licence for
   the hosted image: <https://openf1.org/docs/>
2. Jolpica 2026 drivers sample: Wikipedia `url` only:
   <https://api.jolpi.ca/ergast/f1/2026/drivers.json>
3. OpenF1 lap-segment values and race availability:
   <https://openf1.org/docs/>
4. W3C WCAG 2.2 content-on-hover/focus (tooltips):
   <https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html>
