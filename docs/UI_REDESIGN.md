# UI Redesign Plan (frontend-design skill process)

## Pass 2 — the actual redesign (the first pass was polish, not design)

Honest review: Pass 1 kept the templated dashboard grid and merely tidied
it. Per the skill, the fix is structural, not cosmetic:

- **Hero first**: the app opens on three empty dropdowns and a void. It must
  open *inside a race* — auto-pick the latest full session on first load so
  the map (the one memorable thing) is the first thing seen.
- **Boldness in one place**: amber is currently on tabs, buttons, playheads,
  corners and DRS. After: amber = play signal + playhead only (one action).
  Tabs become quiet text; corner diamonds go white, amber only when selected
  (= action feedback). DRS ticks stay amber — the brief pins them and the
  brief always wins.
- **Type as identity**: Barlow Condensed carries the timing-vernacular
  moments (session bar clock, tower codes, big lap readout); Barlow carries
  UI text; system mono carries deltas/tables only.
- **Engineer earns its space**: the right rail shows session facts when idle
  (GP, circuit, date, lap/driver counts) and the coach card when a corner is
  picked — never a void, never decoration.
- **Structure is information**: tower rows stay code + gap (order is
  position); the lap table keeps its sticky header and sector colors; chips
  stay for highlight; copy stays sentence-case and directive.

## Grounding

Subject: an F1 pit-wall timing monitor for one fan rewatching a Grand Prix.
Audience: the user, a fan. Job: pick a race, watch the field move, compare two
drivers, ask the engineer about a corner. The distinctive language comes from
the subject: broadcast timing screens, garage monitors, phosphor-on-charcoal
telemetry — not generic dashboard chrome.

## Honest critique of the current UI (why it reads "BAD")

Per the skill's generic-tell checklist, the current UI commits almost all of
them: tracked-out ALL-CAPS eyebrows on every panel ("TIMING TOWER", "RACE
ENGINEER"), meta strings joined with middle dots, a single amber word in the
headline, monospace for all small labels, tinted near-black background, and
the SaaS-card kit (identical rounded panels, equal visual weight, no hero).
The map — the one thing this app is for — competes with five equal boxes.
Loading/empty states speak system ("Traces appear once telemetry loads")
instead of directing the user. Boldness is spent everywhere, so nothing lands.

## Token system

Color (brief pins Night Pit-Wall; it wins):
- `--asphalt #0B0E13` — page base
- `--garage #161B24` — raised surfaces
- `--pitline #2A3342` — hairline rules only, never boxes-in-boxes
- `--signal #FFB224` — amber, reserved for play + primary action + playhead
- `--chalk #E8EDF3` — ink; `--dim #8A94A6` — secondary info only
- Data colors (team colors, purple/green sectors, compound blocks) appear
  only on data marks, never on chrome.

Type (two families, distinct roles):
- Display: "Barlow Condensed" semibold, uppercase with wide tracking, for the
  session bar, tower codes, big times. Tabular numerals.
- Text/UI: "Barlow" regular/medium for everything else.
- Deltas + lap table: system monospace (no third webfont).

Layout concept — "the wall": one live monitor, hero-first.

```
+--------------------------------------------------------------+
| session bar: JAPANESE GP · RACE · lap 50 replay      01:32.4 |
+------------------+----------------------------+--------------+
| tower            |                            | engineer     |
| P1 VER +0.000    |      TRACK MAP (hero)      | corner card  |
| P2 SAR +3.355    |      dots · trails ·       | or session   |
| ...              |      corners · DRS         | facts when   |
|                  |                            | idle         |
|                  | [play bar fused to map     |              |
|                  |  bottom edge: play time    |              |
|                  |  scrub 1x2x4 calm]         |              |
+------------------+----------------------------+--------------+
| speed strip (highlighted only)  |  gap chart (top 5)         |
+--------------------------------------------------------------+
| lap table (full width, sticky header, sector colors)         |
| highlight: [driver chips, toggle]  (no cramped multiselect)  |
+--------------------------------------------------------------+
```

- One hero (map, largest surface). Player bar fused to the map's bottom edge
  like a broadcast overlay — never a separate box floating above the map.
- Tower: code + gap only, compact rows; position implied by order (drop P1..Pn
  prefixes — order IS the position).
- Panels below the fold are secondary; tabs stay but visually quiet.
- Copy in sentence case, plain verbs: "Pick a session to start the replay",
  "No telemetry for this lap yet — pick another", "Ask what happened in T1".

## Principles

1. One hero, one accent, everything else quiet.
2. Data colors only on data; chrome stays monochrome + amber signal.
3. Every empty/loading state directs the next action in plain words.
4. Reduced motion + mobile stacking are part of done, not extras.

## Review against the brief

- Night Pit-Wall, dark-only, amber signal, team colors on marks: kept.
- Sector purple/green, 3-decimal times, signed gaps, km/h integers: kept.
- Desktop-first grid, stack on mobile: kept.
- Changed: typography (real condensed face), player fused to map, tower
  without position numbers, sentence-case copy, chips instead of multiselect,
  hero sizing. None of this contradicts the brief; it executes it.
