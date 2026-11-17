# V3.10 — Telemetry AI grounding, data downloads and a printable report

## 1. Telemetry AI said 0 km/h while the chart had traces

Root cause is in the client, not the model: the AI request sent the
**parent replay window** (`p.windowStart`/`p.windowEnd`) while the visible chart
used the **selected scope window** (`start`/`end`). With a fixed lap at
952–1047s the model received a different (sometimes 0–96s) window, so its
aggregates were unrelated to the chart. The fix is to send the same scoped
window to `/ai/explain` that was sent to `/session/telemetry`; the server-built
fact bundle remains the only source.

## 2. Stint summary definitions

OpenF1’s laps/stints endpoints define `stints` as continuous tyre runs with
`lap_start`/`lap_end`/`compound`, and pit data as a `stop_duration` (stationary)
and `pit_duration` (lane). Overtakes are a separate feed and can be incomplete
([OpenF1 docs](https://openf1.org/docs/)). The UI should therefore say:

- **stint** = continuous run on one tyre set;
- **stops** = recorded pit visits;
- **best** = fastest *stationary* stop, not full pit-lane loss;
- **overtakes/lost** = feed counts, not a complete history.

Add tooltips to every summary and a visible “how to read a row” sentence rather
than leaving the numbers unexplained.

## 3. Download formats

The existing exporter is client-side CSV. A dedicated download panel should
offer the session’s available tables (laps, stints, weather, race control,
radio, pit stops, overtake counts) and two formats:

- **CSV** — universally opens in Excel/Sheets; one table per file;
- **JSON** — one bundle for multiple tables and downstream use.

A real `.xlsx` writer would add a large dependency and a second serialization
path for no data benefit; the UI labels CSV as Excel-compatible and explains the
one-table limitation. No new network requests are needed.

## 4. PDF report

Two viable paths:

1. a PDF library (jsPDF/ReportLab) with a second layout implementation; or
2. a **print-first report sheet** using browser print/“Save as PDF”.

The second keeps one HTML layout, preserves the graphics and tables, supports
A4 page breaks with `@media print`, and avoids shipping a PDF library plus a
parallel layout. The report can offer **Data** and **AI-enhanced** modes; the
AI mode calls the existing grounded recap endpoint and prints the narrative
alongside the measured tables. Download is labelled **Print / Save PDF** so the
browser’s PDF destination is explicit.

## Sources

1. OpenF1 API docs — stints, pit, overtakes and lap fields:
   <https://openf1.org/docs/>
2. MDN — `window.print()` and print media:
   <https://developer.mozilla.org/en-US/docs/Web/API/Window/print>
3. MDN — `@media print`:
   <https://developer.mozilla.org/en-US/docs/Web/CSS/@media#media_types>
