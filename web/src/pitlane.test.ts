import { describe, expect, it } from "vitest";
import { buildPitPath, inPitWindow } from "./pitlane";
import type { PitStop } from "./api";
import type { ReplayDriver } from "./types";

const outline = Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  return [Math.cos(a) * 100, Math.sin(a) * 100];
});

const stop: PitStop = { driver_number: 1, t: 20, lap_number: 10, stop_duration: 2.5, pit_duration: 25 };

describe("pit lane guide", () => {
  it("falls back to a labelled schematic when there is no usable transit", () => {
    const path = buildPitPath(new Map(), [stop], 0, outline);
    expect(path?.source).toBe("schematic");
    expect(path?.points.length).toBeGreaterThan(2);
  });

  it("uses a recorded transit only when it is shorter than a significant part of the lap", () => {
    const replay = new Map<number, ReplayDriver>([
      [
        1,
        {
          driver_number: 1,
          t: Array.from({ length: 20 }, (_, i) => 20 + i),
          x: Array.from({ length: 20 }, (_, i) => 110 + i),
          y: Array.from({ length: 20 }, (_, i) => 10 + i),
        },
      ],
    ]);
    const path = buildPitPath(replay, [stop], 0, outline);
    expect(path).not.toBeNull();
    expect(path?.source).toBe("recorded");
  });

  it("knows when a recorded pit transit is active", () => {
    expect(inPitWindow(stop, 19)).toBe(false);
    expect(inPitWindow(stop, 20)).toBe(true);
    expect(inPitWindow(stop, 45)).toBe(true);
    expect(inPitWindow(stop, 46)).toBe(false);
  });
});
