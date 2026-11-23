import { describe, expect, it } from "vitest";
import {
  buildGameCardData,
  GAME_CARD_H,
  GAME_CARD_W,
  selectGameCardRows,
  type GameCardRow,
} from "./gameShareCard";
import { buildGameDrivers, simulateQualifying, simulateRace } from "./game";
import type { StandingsPayload } from "./types";

const standings: StandingsPayload = {
  year: 2025,
  round: null,
  source: "Jolpica F1",
  license: "CC BY-NC-SA 4.0",
  drivers: [
    { position: 1, points: 400, wins: 7, driver_id: "a", code: "AAA", name: "Driver A", constructor: "Team One" },
    { position: 2, points: 300, wins: 3, driver_id: "b", code: "BBB", name: "Driver B", constructor: "Team One" },
    { position: 3, points: 200, wins: 1, driver_id: "c", code: "CCC", name: "Driver C", constructor: "Team Two" },
    { position: 4, points: 100, wins: 0, driver_id: "d", code: "DDD", name: "Driver D", constructor: "Team Two" },
  ],
  constructors: [
    { position: 1, points: 700, wins: 10, constructor_id: "one", name: "Team One" },
    { position: 2, points: 300, wins: 1, constructor_id: "two", name: "Team Two" },
  ],
};

function row(position: number, player: number | null, retired = false): GameCardRow {
  return {
    position,
    driverId: `d${position}`,
    code: `D${position}`,
    name: `Driver ${position}`,
    team: "Team",
    color: "#ffffff",
    gap: position,
    player,
    retired,
  };
}

describe("game result card", () => {
  it("uses the requested 1200×630 canvas size", () => {
    expect(GAME_CARD_W).toBe(1200);
    expect(GAME_CARD_H).toBe(630);
  });

  it("keeps the top 10 plus any player outside it", () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(index + 1, index === 10 ? 1 : null));
    const selected = selectGameCardRows(rows);
    expect(selected).toHaveLength(11);
    expect(selected.some((item) => item.player === 1)).toBe(true);
  });

  it("keeps DNF rows and selects the winner from the classification", () => {
    const drivers = buildGameDrivers(standings);
    const sim = simulateRace(drivers, simulateQualifying(drivers, 8), 5, 8, ["a"]);
    const data = buildGameCardData(sim, drivers, "Test Grand Prix", 8);
    expect(data.rows.length).toBeGreaterThanOrEqual(4);
    expect(data.totalRows).toBe(4);
    expect(data.winner?.retired).toBe(false);
    expect(data.seed).toBe(8);
    expect(data.laps).toBe(5);
    expect(data.events.every((event) => ["SC", "VSC", "CRASH"].includes(event.kind))).toBe(true);
    expect(data.players).toBe(1);
    expect(data.fastestLap).not.toBeNull();
    expect(data.fastestLap?.time).toBeGreaterThan(0);
    expect(data.fastestLap?.lap).toBeGreaterThanOrEqual(1);
    expect(data.biggestMover === null || data.biggestMover.from > data.biggestMover.to).toBe(true);
    expect(data.winnerBestLap).not.toBeNull();
    expect(data.winnerAverageLap).not.toBeNull();
    expect(data.lapsLed).toBeGreaterThanOrEqual(0);
    expect(data.lapsLed).toBeLessThanOrEqual(data.laps);
    const retired = selectGameCardRows([row(1, null), row(2, 1, true)]);
    expect(retired.map((item) => item.retired)).toEqual([false, true]);
  });
});
