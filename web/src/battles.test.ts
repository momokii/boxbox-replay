import { describe, expect, it } from "vitest";
import { currentBattles } from "./battles";

describe("currentBattles", () => {
  it("keeps neighbouring pairs under the threshold, closest first", () => {
    const battles = currentBattles([
      { driver: 1, gap: 0 },
      { driver: 2, gap: 0.4 },
      { driver: 3, gap: 2.0 },
      { driver: 4, gap: 2.6 },
    ]);
    expect(battles.map((b) => [b.a, b.b])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(battles[0].gap).toBeCloseTo(0.4, 6);
    expect(battles[1].gap).toBeCloseTo(0.6, 6);
  });

  it("only compares neighbours, not every pair", () => {
    // Sorted: 1 (0), 3 (0.8), 2 (0.85). 1 and 2 are close but 3 sits between.
    const battles = currentBattles([
      { driver: 1, gap: 0 },
      { driver: 2, gap: 0.85 },
      { driver: 3, gap: 0.8 },
    ]);
    expect(battles.some((b) => b.a === 1 && b.b === 2)).toBe(false);
    expect(battles.map((b) => [b.a, b.b])).toEqual([
      [3, 2],
      [1, 3],
    ]);
  });

  it("ignores missing gaps and handles an empty field", () => {
    expect(currentBattles([{ driver: 1, gap: null }, { driver: 2, gap: 0.2 }])).toEqual([]);
    expect(currentBattles([])).toEqual([]);
  });
});
