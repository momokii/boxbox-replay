/**
 * Recently opened sessions, kept in localStorage so the landing page can offer
 * a "continue" list. Pure functions over an injectable storage object, so the
 * list can be tested without a browser and the user can always delete entries.
 */

export interface RecentSetup {
  year: number;
  meeting: number;
  session: number;
  /** Grand Prix name, e.g. "United States Grand Prix". */
  label: string;
  /** Session and date, e.g. "Race · 2026-10-25". */
  sub: string;
  savedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RECENTS_KEY = "boxbox.recents";
export const MAX_RECENTS = 20;

function storageOrDefault(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isSetup(value: unknown): value is RecentSetup {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.year === "number" &&
    typeof item.meeting === "number" &&
    typeof item.session === "number" &&
    typeof item.label === "string" &&
    typeof item.sub === "string" &&
    typeof item.savedAt === "number"
  );
}

export function parseRecents(raw: string | null): RecentSetup[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSetup).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function loadRecents(storage?: StorageLike): RecentSetup[] {
  const store = storageOrDefault(storage);
  if (!store) return [];
  try {
    return parseRecents(store.getItem(RECENTS_KEY));
  } catch {
    return [];
  }
}

export function saveRecents(list: RecentSetup[], storage?: StorageLike): RecentSetup[] {
  const store = storageOrDefault(storage);
  const trimmed = list.slice(0, MAX_RECENTS);
  if (store) {
    try {
      store.setItem(RECENTS_KEY, JSON.stringify(trimmed));
    } catch {
      // Private mode or a full quota: the session still works, it just is not
      // remembered. Never break the app over a preference.
    }
  }
  return trimmed;
}

/** Newest first, one entry per session. */
export function addRecent(
  list: RecentSetup[],
  entry: RecentSetup,
  storage?: StorageLike,
): RecentSetup[] {
  const rest = list.filter((item) => item.session !== entry.session);
  return saveRecents([entry, ...rest], storage);
}

export function removeRecent(
  list: RecentSetup[],
  session: number,
  storage?: StorageLike,
): RecentSetup[] {
  return saveRecents(
    list.filter((item) => item.session !== session),
    storage,
  );
}

export function clearRecents(storage?: StorageLike): RecentSetup[] {
  return saveRecents([], storage);
}
