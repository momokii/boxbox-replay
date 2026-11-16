import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W, layoutTrack } from "./shareCard";

const outline: [number, number][] = [
  [0, 0],
  [1000, 0],
  [1000, 500],
  [0, 500],
];

describe("layoutTrack", () => {
  it("fits the outline inside the box and preserves aspect ratio", () => {
    const layout = layoutTrack(outline, 48, 190, 1104, 360);
    const points = outline.map(([x, y]) => [layout.X(x), layout.Y(y)]);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...xs)).toBeLessThanOrEqual(48 + 1104);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(190);
    expect(Math.max(...ys)).toBeLessThanOrEqual(190 + 360);
    // 1000×500 in 1104×360 is height-limited; both axes use the same scale.
    expect(layout.scale).toBeCloseTo(360 / 500, 6);
  });

  it("centres the drawing in the box", () => {
    const layout = layoutTrack(outline, 0, 0, 1000, 1000);
    const left = layout.X(0);
    const right = layout.X(1000);
    expect((left + right) / 2).toBeCloseTo(500, 6);
  });

  it("handles an empty outline without NaN", () => {
    const layout = layoutTrack([], 0, 0, CARD_W, CARD_H);
    expect(layout.scale).toBe(1);
    expect(Number.isFinite(layout.X(10))).toBe(true);
  });
});


describe("share-card car rotation", () => {
  it("rotates raw car coordinates by the same angle as the outline", () => {
    const layout = layoutTrack([[-2, -2], [2, 2]], 0, 0, 100, 100);
    // A raw point rotated -90° landed on the outline's coordinate system.
    const rad = (-90 * Math.PI) / 180;
    const x = 0 * Math.cos(rad) - 1 * Math.sin(rad);
    const y = 0 * Math.sin(rad) + 1 * Math.cos(rad);
    expect(layout.X(x)).toBeGreaterThan(0);
    expect(layout.Y(y)).toBeGreaterThan(0);
  });
});
