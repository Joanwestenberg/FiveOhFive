// Small DSP helpers shared by the engine. Pure functions only; no Web Audio.

import type { SyncValue } from '../../model/types';

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** 0-127 value → gain with a squared taper. */
export const level = (v: number) => {
  const x = clamp(v, 0, 127) / 127;
  return x * x;
};

/** 0-127 envelope time → seconds (0 → ~0.5 ms, 127 → 10 s). */
export const envTime = (v: number) => {
  const x = clamp(v, 0, 127) / 127;
  return 0.0005 + 10 * x * x * x;
};

/** 0-127 LFO rate → Hz (0.05 .. ~25 Hz). */
export const lfoHz = (v: number) => 0.05 * Math.pow(2, (clamp(v, 0, 127) / 127) * 9);

/** cutoff units (0-127, may exceed when modulated) → Hz. 127 units = 10 octaves above 20 Hz. */
export const cutoffHz = (u: number) => 20 * Math.pow(2, (u * 10) / 127);

/** Constant-power pan. p in -1..1. */
export const panL = (p: number) => Math.cos(((clamp(p, -1, 1) + 1) * Math.PI) / 4);
export const panR = (p: number) => Math.sin(((clamp(p, -1, 1) + 1) * Math.PI) / 4);

export const SYNC_BEATS: Record<SyncValue, number> = {
  off: 0, '4/1': 16, '2/1': 8, '1/1': 4, '1/2': 2, '1/2T': 4 / 3, '1/4': 1, '1/4D': 1.5, '1/4T': 2 / 3,
  '1/8': 0.5, '1/8D': 0.75, '1/8T': 1 / 3, '1/16': 0.25, '1/16D': 0.375, '1/16T': 1 / 6, '1/32': 0.125,
};
export const SYNC_VALUES = Object.keys(SYNC_BEATS) as SyncValue[];

/** Hz for one cycle per note value at a tempo. */
export const syncHz = (s: SyncValue, bpm: number) => {
  const beats = SYNC_BEATS[s];
  return beats ? bpm / 60 / beats : 0;
};

/** Fast xorshift PRNG returning -1..1. */
export class Rng {
  s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return (this.s / 4294967296) * 2 - 1;
  }
  /** 0..1 */
  uni() {
    return (this.next() + 1) * 0.5;
  }
}

export const softClip = (x: number) => {
  // smooth saturator, unity gain for small signals, asymptote ±1
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
};

/** One-pole lowpass coefficient for a cutoff. */
export const onePoleCoef = (hz: number, sr: number) => 1 - Math.exp((-TAU * hz) / sr);
