# V3.12 — Implementation plan

Release `v3.12.0` — implemented.

1. Add `onHoverDriver` from SessionMap and `hoveredDriver` state in App.
2. Fetch `/session/speed` on first hover of an uncached driver; cache empty
   failures; never prefetch all drivers.
3. Add `speedLoading` to the hover payload and render loading vs unavailable vs
   measured speed distinctly.
4. Verify hover on a non-followed driver loads a speed; verify an empty feed
   shows “speed —”.
5. Verified 93 pytest + 74 vitest, browser hover audit, CI, deploy, tag.
