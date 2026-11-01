import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottler } from "./throttle";

describe("createThrottler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the first call immediately", () => {
    const fire = vi.fn();
    createThrottler(120, fire).notify();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst and still fires the trailing update", () => {
    const fire = vi.fn();
    const t = createThrottler(120, fire);
    t.notify(); // immediate
    t.notify(); // queued
    t.notify(); // still one queued
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(119);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(2); // <-- the pause event that used to be lost
  });

  it("keeps throttling after the trailing fire", () => {
    const fire = vi.fn();
    const t = createThrottler(100, fire);
    t.notify();
    vi.advanceTimersByTime(100);
    t.notify();
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("cancel drops the pending call", () => {
    const fire = vi.fn();
    const t = createThrottler(100, fire);
    t.notify();
    t.notify();
    t.cancel();
    vi.advanceTimersByTime(500);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
