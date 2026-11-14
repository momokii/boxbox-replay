# V3.5a — Optional 3D replay: research and decision

**Question.** Can BoxBox add a visually richer 3D replay without weakening the
2D map as the analytical surface, inventing geometry, or paying for data?

**Short answer.** Yes, as an optional **view** of the same replay data: a lazy-
loaded three.js scene switched on inside Replay, with 2D as the default and the
only place where corners/DRS/hover analysis lives. No new endpoint, no paid
data, no fabricated elevation.

## 1. What the data supports

OpenF1's `/location` endpoint is the only positional source the project uses.
The official docs state it is "the approximate location of the cars on the
circuit, at a sample rate of about 3.7 Hz", that it "lacks details about lateral
placement", and that the origin `(0, 0, 0)` is "arbitrary and not tied to any
specific location on the track" ([OpenF1 docs](https://openf1.org/docs/)).
`analysis.py` records the same convention in this repo: positions are a
top-down plane in x/y and "z is elevation" (`analysis.py`, `map_plane`).

Consequences for a 3D view:

- The **centreline is real** (GPS-derived); track **width is not**. Any ribbon
  width is a visual constant and must be labelled as such, never presented as
  measured track width.
- Elevation exists in the feed but the current geometry endpoint returns only
  x/y. A flat ribbon is the honest v1; do not invent hills.
- Lateral placement is unknown, so cars sit on the centreline in 3D exactly as
  they do in 2D.

## 2. Rendering approach

three.js is the smallest well-documented path from the existing canvas data to
a WebGL scene:

- `WebGLRenderer` exposes `antialias` (default `false`), `setPixelRatio` and
  `setSize`, plus `dispose()` for teardown
  ([source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js)).
- A track ribbon is a `BufferGeometry` built with `setAttribute` and
  `setIndex`; it must be disposed when replaced
  ([source](https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js)).
- `OrbitControls` provides orbit/zoom with `enableDamping`, `dampingFactor`,
  `update()` in the render loop and `dispose()`
  ([source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/controls/OrbitControls.js)).
- Cars are low-poly boxes plus canvas-texture code sprites. 22 cars, one
  ribbon, one ground plane is a trivial WebGL load; pixel ratio is capped at 2
  and no shadows are used, so integrated GPUs stay comfortable.

## 3. Loading and failure behaviour

The scene must never tax the analytical bundle. A dynamic `import()` keeps
three.js out of the main chunk; Vite requires native ESM dynamic import and
splits dynamic imports into separate chunks
([Vite build docs](https://vitejs.dev/guide/build.html),
[Vite features](https://vitejs.dev/guide/features.html#dynamic-import)).
The build output is checked for a separate 3D chunk.

WebGL can be unavailable (old GPU, blocklisted driver, headless, enterprise
policy). The component catches renderer creation failure and offers a button
back to 2D; the 2D map remains the fallback for every feature. Rendering pauses
when the document is hidden. Pointer orbit is opt-in; there is no auto-rotate,
so `prefers-reduced-motion` users get a still camera until they drag.

## 4. Decision

**Build V3.5a as an optional 3D view inside Replay**, not a separate top-level
menu:

- A `2D · 3D` switch in the map card; 2D is the default and remembered only for
  the session, not forced on return visits.
- 3D shows the same cars, colours, selected/followed highlights and replay
  clock. It adds no data, no new API and no analytics claims.
- The ribbon width is a constant visual, stated in the caption; elevation stays
  flat until the geometry endpoint carries z.
- Lazy chunk, WebGL fallback, disposal on unmount, capped DPR, paused when
  hidden.
- Corner labels, DRS zones, hover readout and click-to-seek remain 2D-only for
  now; 3D clicking a car selects it.

**Rejected:** CSS 3D transforms (not a real scene, no camera), a separate
top-level "3D" menu (splits the replay context and implies a second product),
and a globe/terrain (would invent geometry the feed does not contain).

## Sources

1. OpenF1 API docs — location semantics, sample rate, arbitrary origin, no
   lateral placement: <https://openf1.org/docs/>
2. This repo — `analysis.py` `map_plane`: x/y plane, z elevation.
3. three.js `WebGLRenderer` source — antialias, pixel ratio, size, dispose:
   <https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js>
4. three.js `BufferGeometry` source — setAttribute/setIndex/dispose:
   <https://github.com/mrdoob/three.js/blob/dev/src/core/BufferGeometry.js>
5. three.js `OrbitControls` source — damping/update/dispose:
   <https://github.com/mrdoob/three.js/blob/dev/examples/jsm/controls/OrbitControls.js>
6. Vite docs — native ESM dynamic import and build chunking:
   <https://vitejs.dev/guide/build.html>,
   <https://vitejs.dev/guide/features.html#dynamic-import>
7. MDN WebGL API — rendering context and support:
   <https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API>

## Implementation result (2026-11-14)

- `2D · 3D` switch in the Replay map; 2D is still the default and owns corners,
  DRS, hover and corner clicks. 3D adds orbit, zoom, click-to-select and the
  same followed/selected highlighting.
- `three` is a **separate lazy chunk** (523 KB minified, 131 KB gzip); it is not
  requested until the first 3D switch. The main bundle stays ~395 KB / 119 KB
  gzip.
- Geometry is a flat ribbon with a constant 2.4-unit half-width (stated in the
  UI); no fake elevation or lateral placement. The scene uses the same outline,
  `posAt` positions and angle rotation as 2D.
- WebGL failure shows a 2D fallback; the lazy chunk has an error boundary;
  cleanup disposes geometries/materials/textures and forces context loss.
  Damping is off under `prefers-reduced-motion`.
- Offline: the 3D chunk is not in the shell cache, so the 3D button is disabled
  when offline. A session saved offline still replays in 2D.
- Verified in Chromium at 1440 and 390: toggle, orbit, click-to-select, day/night,
  Focus layout, repeated toggles with no page errors, and offline reload with
  22 tower rows.
