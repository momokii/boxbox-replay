/** Pure geometry for the optional 3D view. No three.js imports, so it is testable. */

export interface Projection {
  cx: number;
  cy: number;
  scale: number;
  span: number;
  /** Outline (x, y) -> world (x, z). World y is up; outline y grows up, so z is negated. */
  project: (x: number, y: number) => { x: number; z: number };
}

export interface TrackMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: number[];
  edges: Float32Array;
  projection: Projection;
  halfWidth: number;
}

const SPAN_WORLD = 100;
const HALF_WIDTH_WORLD = 2.4;

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

/** Closed ribbon with left/right kerbs and a flat (honest) surface. */
export function buildTrackMesh(outline: number[][], halfWidth = HALF_WIDTH_WORLD): TrackMesh {
  const n = outline.length;
  if (n < 3) {
    return {
      positions: new Float32Array(),
      normals: new Float32Array(),
      indices: [],
      edges: new Float32Array(),
      projection: makeProjection(outline.length ? outline : [[0, 0], [1, 1]]),
      halfWidth,
    };
  }
  const p = makeProjection(outline);
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const edges = new Float32Array(n * 12);
  const indices: number[] = [];
  const at = (i: number) => outline[(i + n) % n];
  const normal = (i: number) => {
    const prev = at(i - 1);
    const next = at(i + 1);
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };
  const put = (row: number, col: number, x: number, y: number) => {
    const i = (row * 2 + col) * 3;
    positions[i] = x;
    positions[i + 1] = 0.04;
    positions[i + 2] = y;
    normals[i] = 0;
    normals[i + 1] = 1;
    normals[i + 2] = 0;
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
  return { positions, normals, indices, edges, projection: p, halfWidth };
}
