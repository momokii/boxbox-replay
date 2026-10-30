import { useEffect, useReducer } from "react";

export interface PlayState {
  t: number;
  dur: number;
  playing: boolean;
  speed: number;
  calm: boolean;
  rev: number;
}

export interface Playback {
  state: PlayState;
  subscribe: (fn: () => void) => () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setT: (t: number) => void;
  setSpeed: (s: number) => void;
  setDur: (d: number) => void;
  setCalm: (c: boolean) => void;
}

/** Shared mutable playhead with a rAF loop. Components subscribe to `rev`. */
export function createPlayback(): Playback {
  const state: PlayState = { t: 0, dur: 0, playing: false, speed: 1, calm: false, rev: 0 };
  const listeners = new Set<() => void>();
  let raf = 0;
  let last = 0;

  const notify = () => {
    state.rev += 1;
    listeners.forEach((fn) => fn());
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (state.playing && !state.calm && state.dur > 0) {
      state.t = Math.min(state.dur, state.t + dt * state.speed);
      if (state.t >= state.dur) state.playing = false;
      notify();
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    play: () => {
      if (state.t >= state.dur) state.t = 0;
      state.playing = true;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
      notify();
    },
    pause: () => {
      state.playing = false;
      notify();
    },
    toggle: () => {
      if (state.playing) {
        state.playing = false;
      } else {
        if (state.t >= state.dur) state.t = 0;
        state.playing = true;
        last = performance.now();
      }
      if (!raf) raf = requestAnimationFrame(frame);
      notify();
    },
    setT: (t: number) => {
      state.t = Math.max(0, Math.min(state.dur, t));
      notify();
    },
    setSpeed: (s: number) => {
      state.speed = s;
      notify();
    },
    setDur: (d: number) => {
      // Re-setting the same duration must not rewind the replay: effects that
      // depend on the payload run again on unrelated re-renders.
      if (Math.abs(state.dur - d) < 0.05) {
        state.dur = d;
        return;
      }
      state.dur = d;
      state.t = 0;
      state.playing = false;
      notify();
    },
    setCalm: (c: boolean) => {
      state.calm = c;
      if (c) state.playing = false;
      notify();
    },
  };
}

/**
 * Subscribe at a capped rate.
 *
 * The map and timeline need every animation frame; the rest of the page (tower
 * gaps, clock, panels) does not, and re-rendering the whole app at 60 fps is
 * what made playback feel like it stuttered.
 */
export function useThrottledTick(
  playback: Playback,
  minIntervalMs = 120,
): number {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let last = 0;
    return playback.subscribe(() => {
      const now = performance.now();
      if (now - last < minIntervalMs) return;
      last = now;
      bump();
    });
  }, [playback, minIntervalMs]);
  return playback.state.rev;
}
