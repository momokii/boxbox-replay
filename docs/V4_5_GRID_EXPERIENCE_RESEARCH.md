# V4.5 research — Grid viewing, qualifying and result sharing

**Date:** 2026-11-22  
**Baseline:** `v4.4.0`  
**Target:** `v4.5.0`  
**Scope:** BoxBox Grid only. No new API or data source.

## Questions from the review

1. Is 1× still too fast to watch?
2. Why does the qualifying summary still look empty on the right, and the
   progress bar short?
3. Should qualifying have more than one attempt?
4. Can the race begin with a proper “ready” moment instead of another setup
   click?
5. Can a finished Grid race be shared as an image with the result, not only as
   a table on screen?
6. Are the above covered by a real end-to-end check?

## Current implementation evidence

### 1× pace

`web/src/components/GameView.tsx` computes:

```ts
const timeScale = p.sim.duration / Math.max(8, p.sim.laps * 8);
```

`p.sim.duration` for a five-lap race is roughly 490–500 model seconds
(`simulateRace` adds incident losses). At 1× the wall-clock race therefore
finishes in about 40 seconds: roughly **8 seconds per lap**.

The label already admits the pace:

```tsx
1× = ~8 s/lap · {p.sim.duration.toFixed(0)} model seconds
```

Eight seconds per lap is enough to cross the circuit, but not enough to read
the driver desk, notice a VSC, or follow a pass. The user review reports it as
too fast.

### 2. Qualifying card and attempts

`web/src/game.ts` generates one qualifying time per driver:

```ts
export function simulateQualifying(drivers: GameDriver[], seed: number): QualiRow[] {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  return drivers
    .map((driver) => ({
      driverId: driver.id,
      time: 90 + (1 - driver.overall) * 6 + gaussian(rng) * 0.42,
      position: 0,
    }))
    ...
}
```

The UI says “One flying lap. The order is set.” and “Single flying lap · no
Q1/Q2/Q3 split in v1”. There are no attempt values to show.

`web/src/components/game.css` sets the summary progress bar to:

```css
.game-quali-progress { width: min(360px, 100%); }
```

The summary container is a two-column grid. In the review capture the card is
1146 px wide, the main column is about 853 px, and the four facts use 251 px on
the right. The progress bar only uses 360 px of the main column, leaving a
visible empty band between the end of the bar and the facts. The four facts are
real data, but the composition still reads as a left-aligned card.

### 3. Race start

`GameGrid` ends with a button labelled:

```tsx
<button type="button" className="primary" onClick={p.onStart}>Lights out →</button>
```

Clicking it mounts `GameRace`, whose `requestAnimationFrame` loop starts
immediately. There is no staging moment: the user clicks and the simulated
clock is already moving. The user asks for a clear “start” moment so they can
settle in before the race is live.

### 4. Result sharing

`GameResult` renders the classification and two actions (`Race again`,
`New setup`). It has no export action.

The replay already has a mature client-side PNG path:
`web/src/shareCard.ts` draws a **1200×630** card on a `<canvas>` and
`downloadShareCard()` triggers a PNG download. That shows a result PNG is
possible without a server, new API, or a screenshot service. The Grid card
needs different content: winner, classification, player badges, incidents,
seed and the game-model disclaimer. Reusing the replay circuit card would add
track drawing but omit the information a Grid result needs.

### 5. Existing end-to-end coverage

Browser checks in v4.4 exercised setup, qualifying, race, the driver desk,
angle view and mobile. They did **not** exercise:

- the actual wall-clock duration at 1×;
- the pre-race readiness state;
- the qualifying attempt values;
- a downloaded result image;
- a full fresh pass after the qualifying model changes.

## Product decisions

### A. 1× becomes a viewing pace, not a sprint

Set **1× = 12 seconds per lap** of wall-clock time:

| Laps | Approx. 1× race |
|---|---|
| 3 | 36 s |
| 5 | 60 s |
| 10 | 120 s |

The model duration remains the source of truth; `timeScale` is
`duration / (laps * 12)`. 2× and 4× remain available for a quick result. The
label must say **“1× ≈ 12 s/lap”**, not imply real-time. Twelve seconds gives
enough time to register a pass or an incident without making a ten-lap race
unbearable.

This is a deliberate viewing decision, not a claim about real Formula 1 lap
duration.

### B. Two qualifying runs, best time counts

Each driver gets **two seeded flying laps**; the best one sets the grid. This
gives the qualifying screen something real to show, creates a second chance
for a player, and makes the final order less dependent on one noise sample.

**Not** Q1/Q2/Q3 elimination. The UI must keep saying:

> Two flying laps · best counts · no Q1/Q2/Q3 split

The table will show both attempt times and the resulting best. The summary
fact strip will show `Runs = 2`, `P2 gap`, `Pole`, `Best lap`, `Player` and
`Field`. The progress bar will use the full main column.

### C. Start sequence after the grid

Change `Lights out →` to **`Start race →`**. `GameRace` opens with a short
**five-light sequence** (about 3.6 s): lights illuminate one by one, then go
out and the clock starts. No additional click. The canvas shows the grid at
`t=0` while the lights run.

Pause/speed controls are disabled until the lights go out. The sequence uses
`role="status"` and `aria-live="polite"`; reduced-motion users still get the
start but the sequence can be shortened by CSS/JS if needed. This is a viewing
transition, not extra race data.

### D. Result image

Add **`Download result image`** on the Grid result:

- **1200×630 PNG**, drawn client-side on canvas;
- winner name, team, code and “wins”;
- meeting, lap count, seed;
- top 10 classification with position, code, team, gap/DNF and player badge;
- incidents (SC/VSC/CRASH with lap numbers);
- explicit footer: “Local seeded game model · not a prediction · no tyre,
  pit-stop or collision physics”;
- file name `boxbox-grid-<meeting>-<laps>-laps.png`.

No API, no data upload, no third-party service. This is the Grid equivalent of
the existing replay share card, but with the result facts the user asked for.

## UX details

- **Qualifying summary** becomes a real two-column composition: left session
  state + full-width progress + attempt note; right a compact six-fact `<dl>`.
  On phones it stacks and the facts wrap.
- **Qualifying table** adds a `Runs` column (`best / second` style) and keeps
  `Lap time` as the best. On phones the Team and Gap columns are hidden first
  so the attempt column survives.
- **Race start** shows the light sequence in a dedicated panel above the
  canvas; the grid remains visible underneath.
- **Result** gains a second-line action next to `Race again`: `Download result
  image`; failure shows an inline message and leaves the result intact.
- **How panel** updates the qualifying copy to “two flying laps, best counts”
  and mentions the 12 s/lap viewing pace.

## Tests and verification

### Unit / pure

- `simulateQualifying` returns exactly two attempts per driver, the best time
  is `Math.min(...attempts)`, order is ascending best time, and the same seed
  is deterministic.
- A pure pacing helper returns `duration / (laps * 12)` and the 1× wall time
  for 5 laps is 60 s (duration divided by scale).
- Pure result-card helpers select the top 10, keep DNF rows, and expose the
  winner/incident metadata.
- Existing lap mapping, incidents, desk and DNF tests stay green.

### Browser / E2E

1. Open Canada, select it, verify Montréal in the source line.
2. Qualifying shows two attempts per row, `Runs = 2`, and a full-width
   progress bar; no horizontal overflow at 1440 or 390.
3. `Start race` opens the light sequence; the race clock does not advance until
   lights out; after 1× the lap pace is visibly slower.
4. Event banner, driver desk/compare, angle view and result still work.
5. `Download result image` produces a 1200×630 PNG; inspect it visually and
   check its dimensions and file size.
6. Mobile: setup, qualifying, race start, desk and result image button; no page
   errors or horizontal overflow.

## Risks / edge cases

- **Speed change** makes screenshots and E2E timing different; use waits based
  on DOM text, not fixed 8 s assumptions.
- **Two attempts** changes the RNG stream and therefore grids, event seeds and
  result screenshots. Re-find a seeded event for the visual check; tests must
  not depend on a particular driver winning.
- **Canvas fonts**: the result image must fall back to `system-ui`; no local
  font asset is required.
- **Download support**: `canvas.toBlob` and an `<a download>` link are standard
  in modern Chromium and already used by the replay share card. Failure must be
  caught and shown, not crash the result.
- **Pause during lights**: disable controls until `started`; if the user leaves
  the screen, clear timers.
- **Scope**: no real F1 qualifying format, no real-time clock, no server-side
  rendering, no PDF generation.

## Sources

- `web/src/components/GameView.tsx` — `GameQuali`, `GameGrid`, `GameRace`,
  `GameResult`, current `timeScale` and copy.
- `web/src/game.ts` — `simulateQualifying`, `QualiRow`, `simulateRace`.
- `web/src/components/game.css` — `.game-quali-summary`,
  `.game-quali-progress`, `.game-quali-facts`, `.game-table`.
- `web/src/shareCard.ts` — existing 1200×630 canvas PNG download pattern.
- `docs/V4_4_CLOSEOUT.md` — v4.4 delivered scope and honest limits.
- Review capture `image.png` — summary card at 1440 width with the short
  progress bar.
