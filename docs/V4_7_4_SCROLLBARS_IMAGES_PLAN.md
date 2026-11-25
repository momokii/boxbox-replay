# V4.7.4 plan — themed scrollbars and correct portraits

**Target:** `v4.7.4`  
**Baseline:** `v4.7.3`

## Phase 1 — scrollbars

- Add global thin Firefox and Chromium scrollbar styling in `index.css`.
- Track uses the panel surface, thumb uses muted ink, hover uses amber.
- Check the Grid order, modal body, table wrappers and page scroll at desktop
  and mobile.

## Phase 2 — portraits

- Change `matchDriverMedia` to code-first.
- Keep number+name as the fallback only when code is absent.
- Add a champion-number mismatch test (`VER 3` vs OpenF1 `1`).
- Verify 2024 Baku VER/RIC/PER/SAI portraits; no wrong portrait for a number
  collision.

## Phase 3 — E2E/release

- Desktop/mobile screenshots for the themed order scrollbar and a 2024 portrait.
- Full tests/build/browser; update README/CLAUDE/architecture/testing/
  screenshots README/closeout/state; commit and tag `v4.7.4`.

## Acceptance

- No native arrow-button scrollbar remains in the app’s long surfaces.
- Every driver with a matching OpenF1 code shows its portrait; mismatched
  number alone cannot attach another driver.
- Existing loading, incident expiry, history and data retry remain green.

## Shipped

`v4.7.4` shipped on 2026-11-23. Evidence: 94 pytest + 109 vitest, themed
computed scrollbar colors, 2024 VER/RIC/PER/SAI portrait URLs, and no browser
errors; screenshot 87 added.
