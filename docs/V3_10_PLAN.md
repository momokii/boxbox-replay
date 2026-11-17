# V3.10 — Implementation plan

Release `v3.10.0` — implemented.

## Phase 1 — Correct scoped AI and stint explanations

- Send the selected Telemetry scope window to `/ai/explain`; verify the AI
  aggregates match the chart.
- Add tooltips and a visible definition block for stints/stops/best/overtakes;
  update README/ARCHITECTURE glossary.

## Phase 2 — Download panel

- Add a modal with dataset checkboxes (laps, stints, weather, race control,
  radio, pit stops, overtake counts), CSV/JSON format and a clear one-table CSV
  rule.
- Replace the two inline buttons with **Download data…**; keep client-side
  export and no new API calls.
- Test CSV single and JSON multi-download; docs.

## Phase 3 — Session report

- Add a full-screen **Report** button for a session.
- Report sheet: header (GP/session/date), summary cards, circuit outline,
  classification, fastest laps, tyre/stint summary, AI summary.
- Modes: **Data** and **AI-enhanced**; AI uses `/ai/recap`, handles quota/503
  and never blocks the data report.
- **Print / Save PDF** via `window.print()` with A4 print CSS; controls hidden
  in print; page-break rules.
- Verify a print PDF has multiple pages and no app chrome; screenshot the
  report view.

## Phase 4 — Docs, screenshots, release

- README/ARCHITECTURE/TESTING/DEPLOYMENT, V3.10 research/plan, state.
- Refresh affected screenshots (Telemetry AI, stint help, download modal,
  report data/AI).
- Run ruff/pytest/vitest/tsc/build/Playwright; deploy; tag `v3.10.0`.

## Acceptance

- AI explanation for a fixed lap matches the visible traces (no 0 km/h when the
  chart has speed).
- Every stint summary number has an explanation.
- Download panel exports the selected tables in CSV/JSON and explains CSV’s
  one-table rule.
- Report shows data-only and AI-enhanced modes; print output is A4 with no app
  chrome; AI failure is an honest note, not a broken report.
- Existing tests and browser flows remain green.
