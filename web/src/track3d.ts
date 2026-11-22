/** Pure geometry for the optional 3D view. No three.js imports, so it is testable. */

export interface Projection {
  cx: number;
  cy: number;
  scale: number;
  span: number;
  /** Outline (x, y) -> world (x, z). World y is up; outline y grows up, so z is negated. */
  project: (x: number, y: number) => { x: number; z: number };
}

export interface KerbMesh {
  positions: Float32Array;
  indices: number[];
  colors: Float32Array;
}

export interface TrackMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: number[];
  edges: Float32Array;
  kerbs: KerbMesh;
  projection: Projection;
  halfWidth: number;
}

const SPAN_WORLD = 100;

/**
 * The OpenF1 docs do not publish a metric width. These are deliberate visual
 * constants, not measurements: a 5.6 m car against a 12 m track, scaled into
 * the 100-unit circuit world. The old 2.4 half-width made the car ~8× too big
 * relative to the circuit.
 */
export const TRACK_HALF_WIDTH = 0.31;
export const CAR_LENGTH_WORLD = 0.29;
export const CAR_WIDTH_WORLD = 0.105;

export function makeProjection(outline: number[][]): Projection {
  const xs = outline.map((pt) => pt[0]);
  const ys = outline.map((pt) => pt[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1, maxX - minX, maxY - minY);
  const scale = SPAN_WORLD / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    cx,
    cy,
    scale,
    span,
    project: (x, y) => ({ x: (x - cx) * scale, z: -(y - cy) * scale }),
  };
}

function trackNormal(outline: number[][], i: number): { x: number; y: number } {
  const n = outline.length;
  const prev = outline[(i - 1 + n) % n];
  const next = outline[(i + 1) % n];
  const dx = next[0] - prev[0];
  const dy = next[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Left/right kerb strips, alternating red/white per segment. */
function buildKerbs(outline: number[][], halfWidth: number, width: number, projection: Projection): KerbMesh {
  const n = outline.length;
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  const outer = halfWidth + width;
  const red = [0.72, 0.08, 0.08];
  const white = [0.86, 0.88, 0.9];
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const a = projection.project(outline[i][0], outline[i][1]);
      const b = projection.project(outline[j][0], outline[j][1]);
      const na = trackNormal(outline, i);
      const nb = trackNormal(outline, j);
      const base = positions.length / 3;
      // inner at halfWidth, outer at halfWidth+width; two triangles per segment
      positions.push(
        a.x + na.x * halfWidth * side,
        0.045,
        a.z - na.y * halfWidth * side,
        a.x + na.x * outer * side,
        0.045,
        a.z - na.y * outer * side,
        b.x + nb.x * outer * side,
        0.045,
        b.z - nb.y * outer * side,
        b.x + nb.x * halfWidth * side,
        0.045,
        b.z - nb.y * halfWidth * side,
      );
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      const color = i % 2 ? red : white;
      for (let k = 0; k < 4; k += 1) colors.push(...color);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices,
    colors: new Float32Array(colors),
  };
}

/** Closed asphalt ribbon with a flat (honest) surface and kerb strips. */
export function buildTrackMesh(
  outline: number[][],
  halfWidth = TRACK_HALF_WIDTH,
): TrackMesh {
  const n = outline.length;
  if (n < 3) {
    return {
      positions: new Float32Array(),
      normals: new Float32Array(),
      uvs: new Float32Array(),
      indices: [],
      edges: new Float32Array(),
      kerbs: { positions: new Float32Array(), indices: [], colors: new Float32Array() },
      projection: makeProjection(outline.length ? outline : [[0, 0], [1, 1]]),
      halfWidth,
    };
  }
  const p = makeProjection(outline);
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const edges = new Float32Array(n * 12);
  const indices: number[] = [];
  const at = (i: number) => outline[(i + n) % n];
  const normal = (i: number) => trackNormal(outline, i);
  const cumulative = new Float32Array(n + 1);
  for (let i = 1; i < n; i++) {
    const prev = at(i - 1);
    const cur = at(i);
    cumulative[i] = cumulative[i - 1] + Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) * p.scale;
  }
  const put = (row: number, col: number, x: number, y: number) => {
    const i = (row * 2 + col) * 3;
    positions[i] = x;
    positions[i + 1] = 0.04;
    positions[i + 2] = y;
    normals[i] = 0;
    normals[i + 1] = 1;
    normals[i + 2] = 0;
    const u = (row * 2 + col) * 2;
    uvs[u] = col;
    uvs[u + 1] = cumulative[row] / 5;
  };
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i);
    const nrm = normal(i);
    const centre = p.project(x, y);
    // halfWidth is in world units; the outline itself is still source units.
    put(i, 0, centre.x + nrm.x * halfWidth, centre.z - nrm.y * halfWidth);
    put(i, 1, centre.x - nrm.x * halfWidth, centre.z + nrm.y * halfWidth);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = i * 2;
    const b = a + 1;
    const c = j * 2;
    const d = c + 1;
    indices.push(a, b, d, a, d, c);
    const e = i * 12;
    edges.set(
      [
        positions[a * 3], 0.06, positions[a * 3 + 2],
        positions[c * 3], 0.06, positions[c * 3 + 2],
        positions[b * 3], 0.06, positions[b * 3 + 2],
        positions[d * 3], 0.06, positions[d * 3 + 2],
      ],
      e,
    );
  }
  return {
    positions,
    normals,
    uvs,
    indices,
    edges,
    kerbs: buildKerbs(outline, halfWidth, Math.max(0.018, halfWidth * 0.09), p),
    projection: p,
    halfWidth,
  };
}

/**
 * Open ribbon for a pit path or another guide. Points are in world XZ
 * (`[x, z]`), not source map coordinates. The ends are not closed. Pure
 * geometry; no claim that this is a measured lane.
 */
export function buildRibbon(
  points: number[][],
  halfWidth = 0.08,
  y = 0.03,
): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: number[] } {
  const n = points.length;
  if (n < 2) {
    return {
      positions: new Float32Array(),
      normals: new Float32Array(),
      uvs: new Float32Array(),
      indices: [],
    };
  }
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let side = 0; side < 2; side += 1) {
      const s = side === 0 ? 1 : -1;
      const idx = (i * 2 + side) * 3;
      positions[idx] = points[i][0] + nx * halfWidth * s;
      positions[idx + 1] = y;
      positions[idx + 2] = points[i][1] + ny * halfWidth * s;
      normals[idx] = 0;
      normals[idx + 1] = 1;
      normals[idx + 2] = 0;
      const uv = (i * 2 + side) * 2;
      uvs[uv] = side;
      uvs[uv + 1] = i / n;
    }
    if (i < n - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions, normals, uvs, indices };
}
