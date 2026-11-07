import { describe, expect, it } from "vitest";
import {
  addRecent,
  clearRecents,
  loadRecents,
  parseRecents,
  RECENTS_KEY,
  removeRecent,
  type RecentSetup,
  type StorageLike,
} from "./recents";

function fakeStorage(seed?: string): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = seed ? { [RECENTS_KEY]: seed } : {};
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function setup(session: number, savedAt = session): RecentSetup {
  return {
    year: 2026,
    meeting: 100 + session,
    session,
    label: `GP ${session}`,
    sub: "Race",
    savedAt,
  };
}

describe("parseRecents", () => {
  it("survives broken JSON and non-arrays", () => {
    expect(parseRecents("{not json")).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
    expect(parseRecents(null)).toEqual([]);
  });

  it("drops entries that do not match the shape", () => {
    const raw = JSON.stringify([setup(1), { session: "x" }, { year: 2026 }]);
    expect(parseRecents(raw)).toHaveLength(1);
  });
});

describe("addRecent", () => {
  it("puts the newest first and dedupes by session", () => {
    const store = fakeStorage();
    let list = addRecent([], setup(1), store);
    list = addRecent(list, setup(2), store);
    list = addRecent(list, { ...setup(1), sub: "Qualifying" }, store);
    expect(list.map((item) => item.session)).toEqual([1, 2]);
    expect(list[0].sub).toBe("Qualifying");
  });

  it("caps the list at MAX_RECENTS", () => {
    const store = fakeStorage();
    let list: RecentSetup[] = [];
    for (let i = 1; i <= 25; i += 1) list = addRecent(list, setup(i), store);
    expect(list).toHaveLength(20);
    expect(list[0].session).toBe(25);
    expect(list[19].session).toBe(6);
  });
});

describe("remove and clear", () => {
  it("removes one entry and persists", () => {
    const store = fakeStorage();
    const list = addRecent(addRecent([], setup(1), store), setup(2), store);
    const left = removeRecent(list, 1, store);
    expect(left.map((item) => item.session)).toEqual([2]);
    expect(loadRecents(store).map((item) => item.session)).toEqual([2]);
  });

  it("clears everything", () => {
    const store = fakeStorage();
    addRecent([], setup(1), store);
    expect(clearRecents(store)).toEqual([]);
    expect(loadRecents(store)).toEqual([]);
  });
});

describe("loadRecents", () => {
  it("returns [] when storage is unavailable", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    expect(loadRecents(broken)).toEqual([]);
  });
});
