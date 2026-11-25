import { describe, expect, it } from "vitest";
import {
  buildGameDrivers,
  buildRaceFeed,
  activeRaceEvent,
  RACE_EVENT_ACTIVE_SECONDS,
  driverLapHistory,
  gameClockScale,
  incidentPlaybackFactor,
  matchDriverMedia,
  GAME_SECONDS_PER_LAP,
  lapFraction,
  mulberry32,
  RACE_EVENT_LOSS,
  raceState,
  QUALI_ATTEMPTS,
  simulateQualifying,
  simulateRace,
  validatePlayerDrivers,
} from "./game";
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

describe("buildGameDrivers", () => {
  it("normalizes driver and team form into a descending overall", () => {
    const drivers = buildGameDrivers(standings);
    expect(drivers.map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
    expect(drivers[0].overall).toBeGreaterThan(drivers[1].overall);
    expect(drivers[0].teamScore).toBe(1);
    expect(drivers[2].teamScore).toBeCloseTo(300 / 700, 5);
    expect(drivers.every((d) => d.overall > 0 && d.overall <= 1)).toBe(true);
  });

  it("is deterministic and returns an empty field for an empty table", () => {
    expect(buildGameDrivers(standings)).toEqual(buildGameDrivers(standings));
    expect(buildGameDrivers({ ...standings, drivers: [], constructors: [] })).toEqual([]);
  });
});

describe("driver media matching", () => {
  it("requires the timing code to agree with the number", () => {
    const driver = { ...buildGameDrivers(standings)[0], number: "3", code: "AAA" };
    const wrongNumber = {
      driver_number: 3,
      name_acronym: "BBB",
      team_name: "Other",
      team_colour: "ffffff",
    };
    const right = {
      driver_number: 3,
      name_acronym: "AAA",
      team_name: "Team One",
      team_colour: "ffffff",
      headshot_url: "https://example.test/aaa.png",
    };
    expect(matchDriverMedia(driver, [wrongNumber])).toBeNull();
    expect(matchDriverMedia(driver, [wrongNumber, right])).toEqual(right);
  });
});

describe("lapFraction", () => {
  it("maps lap progress back onto one circuit per lap", () => {
    expect(lapFraction(0)).toBe(0);
    expect(lapFraction(1)).toBe(0);
    expect(lapFraction(2.25)).toBeCloseTo(0.25);
    expect(lapFraction(4.9)).toBeCloseTo(0.9);
    expect(lapFraction(5)).toBe(0);
    expect(lapFraction(-0.2)).toBeCloseTo(0.8);
  });
});

describe("qualifying", () => {
  it("is seeded, assigns every driver once and orders by time", () => {
    const drivers = buildGameDrivers(standings);
    const a = simulateQualifying(drivers, 42);
    const b = simulateQualifying(drivers, 42);
    expect(a).toEqual(b);
    expect(a.map((r) => r.driverId).sort()).toEqual(["a", "b", "c", "d"]);
    expect(a.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(a.map((r) => r.time)).toEqual([...a.map((r) => r.time)].sort((x, y) => x - y));
  });

  it("gives every driver two attempts and keeps the best time", () => {
    const drivers = buildGameDrivers(standings);
    const rows = simulateQualifying(drivers, 42);
    expect(QUALI_ATTEMPTS).toBe(2);
    expect(rows.every((row) => row.attempts.length === 2)).toBe(true);
    for (const row of rows) {
      expect(row.time).toBe(Math.min(...row.attempts));
    }
    expect(rows.map((row) => row.time)).toEqual(
      [...rows.map((row) => row.time)].sort((a, b) => a - b),
    );
  });

  it("uses the seeded random source, not Math.random", () => {
    const rng = mulberry32(7);
    expect(rng()).toBe(mulberry32(7)());
  });
});

describe("viewing pace", () => {
  it("makes a five-lap 1× race take 100 wall seconds", () => {
    expect(GAME_SECONDS_PER_LAP).toBe(20);
    const modelSeconds = 490;
    const scale = gameClockScale(modelSeconds, 5);
    expect(scale).toBeCloseTo(modelSeconds / 100, 6);
    expect(modelSeconds / scale).toBeCloseTo(100, 6);
  });
});

describe("driver lap history", () => {
  it("returns every completed lap with monotonic race time", () => {
    const drivers = buildGameDrivers(standings);
    const sim = simulateRace(drivers, simulateQualifying(drivers, 8), 5, 8, ["a"]);
    const finisher = sim.drivers.find((driver) => driver.retiredLap == null);
    expect(finisher).toBeTruthy();
    const laps = driverLapHistory(sim, finisher!.id);
    expect(laps).toHaveLength(5);
    expect(laps.every((lap) => lap.time != null && lap.time > 0)).toBe(true);
    expect(laps.map((lap) => lap.lap)).toEqual([1, 2, 3, 4, 5]);
    expect(laps.every((lap, index) => index === 0 || lap.raceTime > laps[index - 1].raceTime)).toBe(true);
    expect(laps.every((lap) => lap.position > 0)).toBe(true);
  });

  it("does not reveal future laps at an early clock", () => {
    const drivers = buildGameDrivers(standings);
    const sim = simulateRace(drivers, simulateQualifying(drivers, 8), 5, 8);
    const finisher = sim.drivers.find((driver) => driver.retiredLap == null);
    expect(finisher).toBeTruthy();
    const early = driverLapHistory(sim, finisher!.id, 1);
    expect(early).toHaveLength(0);
    const firstLap = driverLapHistory(sim, finisher!.id, sim.baseLap);
    expect(firstLap.length).toBeLessThanOrEqual(1);
  });

  it("marks a retirement lap as DNF and does not invent a lap time", () => {
    const drivers = buildGameDrivers(standings);
    for (let seed = 1; seed <= 500; seed += 1) {
      const sim = simulateRace(drivers, simulateQualifying(drivers, seed), 5, seed);
      const crash = sim.events.find((event) => event.kind === "CRASH");
      if (!crash?.driverId) continue;
      const laps = driverLapHistory(sim, crash.driverId);
      expect(laps.at(-1)?.status).toBe("DNF");
      expect(laps.at(-1)?.time).toBeNull();
      expect(laps.length).toBe(crash.lap);
      expect(laps.some((lap) => lap.event === "CRASH")).toBe(true);
      return;
    }
    throw new Error("no seeded crash found");
  });
});

describe("race feed", () => {
  it("builds a deterministic feed with leader, incidents and finish", () => {
    const drivers = buildGameDrivers(standings);
    const sim = simulateRace(drivers, simulateQualifying(drivers, 8), 5, 8);
    const feed = buildRaceFeed(sim, drivers);
    expect(feed).toEqual(buildRaceFeed(sim, drivers));
    expect(feed.some((item) => item.kind === "leader")).toBe(true);
    expect(feed.some((item) => item.kind === "finish")).toBe(true);
    expect(feed.some((item) => item.kind === "event")).toBe(true);
    expect(feed.every((item) => item.t >= 0 && item.t <= sim.duration)).toBe(true);
    expect(feed.map((item) => item.t)).toEqual([...feed.map((item) => item.t)].sort((a, b) => a - b));
  });
});

describe("active incident window", () => {
  it("expires the visual incident after its active window", () => {
    const drivers = buildGameDrivers(standings);
    for (let seed = 1; seed <= 500; seed += 1) {
      const sim = simulateRace(drivers, simulateQualifying(drivers, seed), 5, seed);
      const event = sim.events.find((item) => item.kind !== "CRASH") ?? sim.events[0];
      if (!event) continue;
      expect(activeRaceEvent(sim.events, event.t)).toEqual(event);
      expect(activeRaceEvent(sim.events, event.t + RACE_EVENT_ACTIVE_SECONDS[event.kind] + 0.1)).toBeNull();
      return;
    }
    throw new Error("no seeded incident found");
  });
});

describe("incident playback", () => {
  it("slows SC/VSC playback only inside the incident window", () => {
    expect(incidentPlaybackFactor("SC", 0)).toBe(0.35);
    expect(incidentPlaybackFactor("SC", 12)).toBe(0.35);
    expect(incidentPlaybackFactor("SC", 12.1)).toBe(1);
    expect(incidentPlaybackFactor("VSC", 0)).toBe(0.45);
    expect(incidentPlaybackFactor("VSC", 8.1)).toBe(1);
    expect(incidentPlaybackFactor("CRASH", 0)).toBe(1);
    expect(incidentPlaybackFactor(null, 0)).toBe(1);
  });
});

describe("race", () => {
  it("rejects duplicate player drivers", () => {
    expect(validatePlayerDrivers(["a", "a"])).toContain("different");
    expect(validatePlayerDrivers(["a", "b"])).toBeNull();
    expect(validatePlayerDrivers([])).not.toBeNull();
  });

  it.each([3, 5, 10])("finishes a %i-lap race with a valid classification", (laps) => {
    const drivers = buildGameDrivers(standings);
    const grid = simulateQualifying(drivers, 9);
    const sim = simulateRace(drivers, grid, laps, 9, ["a", "c"]);
    expect(sim.laps).toBe(laps);
    expect(sim.preview).toHaveLength(4);
    expect(sim.preview.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(sim.preview.map((r) => r.driverId).sort()).toEqual(["a", "b", "c", "d"]);
    const players = sim.preview.filter((r) => r.player != null);
    expect(players.map((r) => r.player)).toEqual([1, 2]);
    const state = raceState(sim, sim.duration);
    expect(state.finished).toBe(true);
    expect(state.rows[0].progress).toBe(laps);
    expect(state.rows.every((r) => r.finished)).toBe(true);
  });

  it("produces deterministic seeded race-control events", () => {
    const drivers = buildGameDrivers(standings);
    const grid = simulateQualifying(drivers, 17);
    const a = simulateRace(drivers, grid, 5, 17);
    const b = simulateRace(drivers, grid, 5, 17);
    expect(a.events).toEqual(b.events);
    const seedWithEvent = Array.from({ length: 500 }, (_, i) => i + 1).find((seed) => {
      const sim = simulateRace(drivers, simulateQualifying(drivers, seed), 5, seed);
      return sim.events.length > 0;
    });
    expect(seedWithEvent).toBeTruthy();
    const sim = simulateRace(drivers, simulateQualifying(drivers, seedWithEvent!), 5, seedWithEvent!);
    expect(sim.events.every((event) => ["SC", "VSC", "CRASH"].includes(event.kind))).toBe(true);
  });

  it("applies SC and VSC time loss to the event lap", () => {
    const drivers = buildGameDrivers(standings);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 500 && seen.size < 2; seed += 1) {
      const sim = simulateRace(drivers, simulateQualifying(drivers, seed), 5, seed);
      for (const kind of ["SC", "VSC"] as const) {
        if (seen.has(kind)) continue;
        const event = sim.events.find((item) => item.kind === kind);
        if (!event) continue;
        const active = sim.drivers.filter(
          (driver) => driver.retiredLap == null || driver.retiredLap > event.lap,
        );
        if (!active.length) continue;
        const driver = active[0];
        const others = driver.lapTimes
          .filter((_, index) => index !== event.lap - 1)
          .sort((a, b) => a - b);
        const median = others[Math.floor(others.length / 2)];
        expect(driver.lapTimes[event.lap - 1] - median).toBeGreaterThan(
          RACE_EVENT_LOSS[kind] * 0.8,
        );
        seen.add(kind);
      }
    }
    expect([...seen].sort()).toEqual(["SC", "VSC"]);
  });

  it("keeps crash retirements out of the active classification", () => {
    const drivers = buildGameDrivers(standings);
    for (let seed = 1; seed <= 500; seed += 1) {
      const sim = simulateRace(drivers, simulateQualifying(drivers, seed), 5, seed);
      const crash = sim.events.find((event) => event.kind === "CRASH");
      if (!crash) continue;
      const retired = sim.preview.find((row) => row.driverId === crash.driverId);
      expect(retired?.retired).toBe(true);
      expect(retired?.position).toBeGreaterThan(sim.preview.filter((r) => !r.retired).length);
      const state = raceState(sim, sim.duration);
      expect(state.rows.find((r) => r.driverId === crash.driverId)?.retired).toBe(true);
      return;
    }
    throw new Error("no seeded crash found");
  });

  it("starts at zero progress and advances on the clock", () => {
    const drivers = buildGameDrivers(standings);
    const grid = simulateQualifying(drivers, 1);
    const sim = simulateRace(drivers, grid, 5, 1, ["a"]);
    const start = raceState(sim, 0);
    expect(start.rows.every((r) => r.progress === 0)).toBe(true);
    const mid = raceState(sim, sim.duration / 2);
    expect(mid.rows.some((r) => r.progress > 0)).toBe(true);
    expect(mid.rows.some((r) => r.progress < sim.laps)).toBe(true);
    expect(start.leaderId).toBeTruthy();
  });
});
