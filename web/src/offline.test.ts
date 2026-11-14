import { describe, expect, it } from "vitest";
import { OFFLINE_LIMIT_BYTES, sessionUrls } from "./offline";

describe("offline session cache", () => {
  it("requests every payload the replay needs", () => {
    const urls = sessionUrls(11396);
    expect(urls).toContain("/api/session/replay?session_key=11396");
    expect(urls).toContain("/api/session/geometry?session_key=11396");
    expect(urls).toContain("/api/laps?session_key=11396");
    expect(urls.every((url) => url.includes("session_key=11396"))).toBe(true);
    expect(urls.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the documented 25 MB budget", () => {
    expect(OFFLINE_LIMIT_BYTES).toBe(25 * 1024 * 1024);
  });
});
