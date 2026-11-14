import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildTrackMesh, makeProjection } from "./track3d";

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("makeProjection", () => {
  it("centres and scales the outline to a 100-unit world", () => {
    const p = makeProjection(square);
    const a = p.project(0, 0);
    const b = p.project(100, 100);
    expect(Math.abs(a.x + 50)).toBeLessThan(1e-6);
    expect(Math.abs(a.z - 50)).toBeLessThan(1e-6);
    expect(Math.abs(b.x - 50)).toBeLessThan(1e-6);
    expect(Math.abs(b.z + 50)).toBeLessThan(1e-6);
  });
});

describe("buildTrackMesh", () => {
  it("builds two rows, a closed index list and upward normals", () => {
    const mesh = buildTrackMesh(square);
    expect(mesh.positions.length).toBe(square.length * 2 * 3);
    expect(mesh.indices.length).toBe(square.length * 6);
    expect(mesh.edges.length).toBe(square.length * 12);
    expect(mesh.normals[1]).toBe(1);
    const left = new THREE.Vector3(mesh.positions[0], mesh.positions[1], mesh.positions[2]);
    const right = new THREE.Vector3(mesh.positions[3], mesh.positions[4], mesh.positions[5]);
    expect(left.distanceTo(right)).toBeCloseTo(mesh.halfWidth * 2, 5);
    for (const value of mesh.positions) expect(Number.isFinite(value)).toBe(true);
  });

  it("does not crash on a degenerate outline", () => {
    const mesh = buildTrackMesh([[0, 0], [1, 1]]);
    expect(mesh.positions.length).toBe(0);
    expect(mesh.indices).toEqual([]);
  });
});
