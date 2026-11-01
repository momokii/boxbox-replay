/**
 * Trailing-edge throttle.
 *
 * A plain "drop if too soon" throttle loses the last event of a burst, which is
 * exactly the event that matters for discrete state (pause, seek, speed). This
 * coalesces calls and guarantees a trailing fire, so the UI can never be left
 * showing a stale state after playback stops.
 */
export interface Throttler {
  notify: () => void;
  cancel: () => void;
}

export function createThrottler(minIntervalMs: number, fire: () => void): Throttler {
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    last = Date.now();
    timer = null;
    fire();
  };

  return {
    notify: () => {
      const now = Date.now();
      const wait = minIntervalMs - (now - last);
      if (wait <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        run();
      } else if (!timer) {
        timer = setTimeout(run, wait);
      }
    },
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
