/** Explicit offline cache for one session, bounded to 25 MB. */

export const OFFLINE_CACHE = "boxbox-offline-v3";
export const OFFLINE_LIMIT_BYTES = 25 * 1024 * 1024;

export interface OfflineInfo {
  label: string;
  bytes: number;
  count: number;
  savedAt: number;
}

const key = (session: number) => `boxbox.offline.${session}`;

export function sessionUrls(sessionKey: number): string[] {
  const q = `?session_key=${sessionKey}`;
  return [
    `/api/session/info${q}`,
    `/api/session/geometry${q}`,
    `/api/session/replay${q}`,
    `/api/session/gaps${q}`,
    `/api/session/pit${q}`,
    `/api/session/positions${q}`,
    `/api/session/overtakes${q}`,
    `/api/session/result${q}`,
    `/api/drivers${q}`,
    `/api/laps${q}`,
    `/api/stints${q}`,
    `/api/weather${q}`,
    `/api/race-control${q}`,
  ];
}

export function offlineInfo(sessionKey: number): OfflineInfo | null {
  try {
    const raw = localStorage.getItem(key(sessionKey));
    return raw ? (JSON.parse(raw) as OfflineInfo) : null;
  } catch {
    return null;
  }
}

export function isOfflineSession(sessionKey: number): boolean {
  return offlineInfo(sessionKey) != null;
}

export async function saveSessionOffline(
  sessionKey: number,
  label: string,
): Promise<{ ok: true; info: OfflineInfo } | { ok: false; reason: string }> {
  if (typeof caches === "undefined") {
    return { ok: false, reason: "This browser cannot cache sessions." };
  }
  const cache = await caches.open(OFFLINE_CACHE);
  // Cache the shell (HTML + hashed JS/CSS) so the offline reload can boot.
  const shell = new Set<string>(["/", "/manifest.webmanifest", "/favicon.svg"]);
  document
    .querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel='stylesheet']")
    .forEach((node) => {
      const url = node instanceof HTMLScriptElement ? node.src : node.href;
      if (url.startsWith(location.origin)) shell.add(url);
    });
  for (const url of shell) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) await cache.put(url, response);
    } catch {
      // The app still works online if a shell asset could not be cached.
    }
  }
  const stored: string[] = [];
  let bytes = 0;
  for (const url of sessionUrls(sessionKey)) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const size = (await response.clone().blob()).size;
      if (bytes + size > OFFLINE_LIMIT_BYTES) {
        for (const saved of stored) await cache.delete(saved);
        return {
          ok: false,
          reason: "This session is larger than 25 MB; it cannot be stored offline.",
        };
      }
      await cache.put(url, response);
      stored.push(url);
      bytes += size;
    } catch {
      // A missing payload is fine as long as the replay core made it.
    }
  }
  if (!stored.length) {
    return { ok: false, reason: "Nothing could be cached for this session." };
  }
  const info: OfflineInfo = {
    label,
    bytes,
    count: stored.length,
    savedAt: Date.now(),
  };
  localStorage.setItem(key(sessionKey), JSON.stringify(info));
  return { ok: true, info };
}

export async function removeSessionOffline(sessionKey: number): Promise<void> {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(OFFLINE_CACHE);
    for (const url of sessionUrls(sessionKey)) await cache.delete(url);
  }
  localStorage.removeItem(key(sessionKey));
}
