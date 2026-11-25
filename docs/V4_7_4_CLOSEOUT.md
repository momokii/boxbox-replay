# V4.7.4 close-out — themed scrollbars and correct portraits

**Release:** `v4.7.4`  
**Baseline:** `v4.7.3`

## Fixes

### App-wide themed scrollbars

`web/src/index.css` now defines thin themed scrollbars for every scrollable
surface:

- dark panel track;
- rounded muted thumb;
- amber thumb on hover;
- 10 px Chromium width/height, no native arrow buttons;
- Firefox `scrollbar-width: thin` and `scrollbar-color`.

This covers the Grid order strip, modals, table wrappers and the page scroll,
not only one component.

### Portraits are matched by timing code

`matchDriverMedia` now tries the OpenF1 timing code first. Number + full-name
is only a fallback when no code exists. This fixes the 2024 Verstappen case:
Jolpica says permanent number 3 while OpenF1 uses champion number 1, but both
say `VER`.

It still cannot borrow a number-collision portrait — the wrong-code collision
test remains null.

Verified at 2024 Baku:

- `VER` → Max Verstappen, maxver01 URL;
- `RIC` → Daniel Ricciardo, danric01 URL;
- `PER` → Sergio Pérez, serper01 URL;
- `SAI` → Carlos Sainz, carsai01 URL.

## Verification

| Check | Evidence |
|---|---|
| API tests | `.venv/bin/python -m pytest` → **94 passed** |
| Web tests | `cd web && npx vitest run` → **23 files, 109 tests passed** |
| Lint/type/build | ruff clean · `tsc -b` exit 0 · `npm run build` exit 0 |
| 2024 portraits | VER/RIC/PER/SAI each returned the matching portrait URL |
| Collision test | wrong code at the same number returns no media |
| Scrollbar | computed `scrollbar-color` uses themed thumb/panel; screenshot shows no native arrows |
| Browser errors | none |

## Screenshots

`87-grid-themed-scrollbars.png` added; existing identity/feed/event captures
remain valid.

## Honest limits

A driver without a matching OpenF1 code/portrait gets the number fallback, not
a fabricated image. The scrollbar is a visual theme, not a data change.
