import { describe, expect, it } from "vitest";
import { ariaSort, sortMark, sortRows } from "./sort";

const rows = [
  { name: "VER", time: 93.7, lap: 50 },
  { name: "PER", time: 93.9, lap: 50 },
  { name: "NOR", time: null, lap: 48 },
  { name: "LEC", time: 93.8, lap: 47 },
];

const get = (r: (typeof rows)[number], key: string) =>
  key === "name" ? r.name : key === "time" ? r.time : r.lap;

describe("sortRows", () => {
  it("sorts numbers descending with nulls last", () => {
    const out = sortRows(rows, get, { key: "time", dir: "desc" });
    expect(out.map((r) => r.name)).toEqual(["PER", "LEC", "VER", "NOR"]);
  });

  it("sorts text ascending and stays stable for equal values", () => {
    expect(sortRows(rows, get, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual([
      "LEC",
      "NOR",
      "PER",
      "VER",
    ]);
    expect(sortRows(rows, get, { key: "lap", dir: "desc" }).map((r) => r.name)).toEqual([
      "VER",
      "PER",
      "NOR",
      "LEC",
    ]);
  });
});

describe("header helpers", () => {
  it("exposes aria-sort and a marker", () => {
    expect(ariaSort({ key: "time", dir: "asc" }, "time")).toBe("ascending");
    expect(ariaSort({ key: "time", dir: "desc" }, "time")).toBe("descending");
    expect(ariaSort({ key: "time", dir: "asc" }, "lap")).toBe("none");
    expect(sortMark({ key: "time", dir: "desc" }, "time")).toBe("▼");
    expect(sortMark(null, "time")).toBe("");
  });
});
