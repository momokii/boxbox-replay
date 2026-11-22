import { describe, expect, it } from "vitest";
import { buildPitPath, inPitWindow } from "./pitlane";
import type { PitStop } from "./api";

const outline = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  return [Math.cos(a) * 100, Math.sin(a) * 100];
});

const stop: PitStop = { driver_number: 1, t: 20, lap_number: 10, stop_duration: 2.5, pit_duration: 25 };

describe("pit lane guide", () => {
  it("always returns the short labelled schematic guide", () => {
    const path = buildPitPath(outline);
    expect(path?.source).toBe("schematic");
    expect(path?.points.length).toBeGreaterThan(2);
    expect(path?.points.length).toBeLessThanOrEqual(40);
  });

  it("returns null for a degenerate outline", () => {
    expect(buildPitPath([[0, 0], [1, 1]])).toBeNull();
  });

  it("knows when a recorded pit transit is active", () => {
    expect(inPitWindow(stop, 19)).toBe(false);
    expect(inPitWindow(stop, 20)).toBe(true);
    expect(inPitWindow(stop, 45)).toBe(true);
    expect(inPitWindow(stop, 46)).toBe(false);
  });
});
