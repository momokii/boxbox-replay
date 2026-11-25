# V4.7.4 research — native scrollbars and missing portraits

**Date:** 2026-11-23  
**Baseline:** `v4.7.3`  
**Target:** `v4.7.4` (patch)

## Problems

1. Scrollable Grid areas still show a default browser scrollbar with a bright
   track and native arrow buttons. It reads as an unstyled control against the
   pit-wall surface.
2. Some driver portraits disappeared after the identity-integrity fix — notably
   Max Verstappen in the 2024 dataset.

## Scrollbars

No app-wide scrollbar rule existed. Chromium therefore rendered the native
scrollbar in `.game-order-scroll`, table scrollers, modals and long panels. The
browser arrow buttons and light track are the “old HTML” look in the review.

## Missing portrait

The v4.7.3 matcher required **number and code** to agree:

```ts
row.driver_number === Number(driver.number) &&
row.name_acronym === driver.code
```

Jolpica reports Verstappen’s **permanent number 3** for 2024, while OpenF1 uses
his champion number **1** in the 2024 session. Both have code `VER`. The
matcher therefore returned `null` and the UI showed the number fallback — not a
deleted image, but no portrait. The old number-only matcher had the opposite
problem (number 3 also belonged to Ricciardo), which caused the original wrong
photo.

The timing code is the stable identity within a session. Jolpica’s permanent
number is not.

## Fix

- Add app-wide themed scrollbars:
  - thin Firefox `scrollbar-width`/`scrollbar-color`;
  - 10 px Chromium track and rounded thumb;
  - dark panel track, dim thumb, amber hover;
  - no native arrow buttons.
- Match media by **code first**. Only fall back to number + full-name when no
  code is present, so a champion-number mismatch still gets the correct
  portrait while a number collision cannot.
- Keep the canonical game-driver name/team/code and the image URL key.
- Extend the unit test with a champion-number mismatch (`VER 3` vs OpenF1 `1`)
  that must still return the correct portrait, while a wrong-code collision must
  still return null.

## Verification

- 2024 Baku hovers: VER, RIC, PER and SAI all show the correct portrait URL.
- No number-collision portrait can be selected.
- Scrollbar computed color is the themed thumb/track pair; screenshot shows no
  native arrows.
- 94 pytest + 109 vitest; desktop/mobile E2E; no page errors.
