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
