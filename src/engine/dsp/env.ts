import { envTime, Rng, lfoHz, syncHz } from './math';
import type { Lfo } from '../../model/types';

/**
 * Four-stage envelope (T1..T4 with levels). Stage 1-3 run after note on, the envelope
 * holds at the stage-3 level until release, then stage 4 runs to the final level.
 * Rising segments are slightly convex, falling ones exponential-like.
 */
export class Env {
  stage = 0; // 0 idle, 1..3 attack/decay, 4 sustain, 5 release, 6 done
  value = 0;
  from = 0;
  p = 0;
  inc = 0;
  times = [0, 0, 0, 0];
  levels = [0, 0, 0, 0, 0]; // l0 (start), l1, l2, l3 (sustain), l4 (end)
  sr = 48000;

  start(sr: number, times: number[], levels: number[]) {
    this.sr = sr;
    for (let i = 0; i < 4; i++) this.times[i] = times[i];
    for (let i = 0; i < 5; i++) this.levels[i] = levels[i];
    this.value = levels[0];
    this.enter(1);
  }

  /** Re-trigger from the current value (legato off, same voice). */
  retrigger() {
    this.levels[0] = this.value;
    this.enter(1);
  }

  private enter(stage: number) {
    this.stage = stage;
    this.from = this.value;
    this.p = 0;
    if (stage >= 1 && stage <= 3) {
      const t = this.times[stage - 1];
      this.inc = 1 / Math.max(1, t * this.sr);
    } else if (stage === 5) {
      const t = this.times[3];
      this.inc = 1 / Math.max(1, t * this.sr);
    } else this.inc = 0;
  }

  release() {
    if (this.stage > 0 && this.stage < 5) this.enter(5);
  }

  get done() {
    return this.stage === 6;
  }

  /** Advance n samples and return the current value. */
  tick(n: number) {
    const s = this.stage;
    if (s === 0 || s === 4 || s === 6) {
      if (s === 4) this.value = this.levels[3];
      return this.value;
    }
    this.p += this.inc * n;
    const target = s === 5 ? this.levels[4] : this.levels[s];
    if (this.p >= 1) {
      this.value = target;
      if (s === 5) this.stage = 6;
      else if (s === 3) this.enter(4);
      else this.enter(s + 1);
      return this.value;
    }
    const p = this.p;
    const shaped = target > this.from ? 1 - (1 - p) * (1 - p) : 1 - (1 - p) * (1 - p) * (1 - p);
    this.value = this.from + (target - this.from) * shaped;
    return this.value;
  }
}

export const envTimes = (t1: number, t2: number, t3: number, t4: number, atk = 1, dec = 1, rel = 1) => [
  envTime(t1) * atk,
  envTime(t2) * dec,
  envTime(t3) * dec,
  envTime(t4) * rel,
];

/** Per-voice LFO evaluated at control rate. */
export class LfoState {
  phase = 0;
  t = 0; // seconds since note on
  value = 0;
  sh = 0;
  rndA = 0;
  rndB = 0;
  chaos = 0.37;
  lastCycle = 0;
  rng = new Rng(77);

  start(cfg: Lfo, globalTime: number, seed: number) {
    this.rng.s = (seed * 2246822519) >>> 0 || 1;
    this.t = 0;
    this.phase = cfg.keySync ? 0 : (globalTime * lfoHz(cfg.rate)) % 1;
    this.sh = this.rng.next();
    this.rndA = this.rng.next();
    this.rndB = this.rng.next();
    this.chaos = 0.2 + this.rng.uni() * 0.6;
    this.lastCycle = 0;
  }

  /** Advance dtSec; returns value in -1..1 multiplied by delay/fade gain. */
  tick(cfg: Lfo, dtSec: number, bpm: number, rateOffset: number) {
    this.t += dtSec;
    const hz = cfg.sync !== 'off' ? syncHz(cfg.sync, bpm) : lfoHz(cfg.rate + rateOffset);
    this.phase += hz * dtSec;
    let cycled = false;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      cycled = true;
    }
    const p = this.phase;
    let v = 0;
    switch (cfg.wave) {
      case 'tri':
        v = 1 - 4 * Math.abs(p - 0.5);
        break;
      case 'sin':
        v = Math.sin(p * Math.PI * 2);
        break;
      case 'saw':
        v = 2 * p - 1;
        break;
      case 'sqr':
        v = p < 0.5 ? 1 : -1;
        break;
      case 'trp': {
        const tri = 1 - 4 * Math.abs(p - 0.5);
        v = Math.max(-1, Math.min(1, tri * 2));
        break;
      }
      case 'sh':
        if (cycled) this.sh = this.rng.next();
        v = this.sh;
        break;
      case 'rnd':
        if (cycled) {
          this.rndA = this.rndB;
          this.rndB = this.rng.next();
        }
        v = this.rndA + (this.rndB - this.rndA) * (0.5 - 0.5 * Math.cos(p * Math.PI));
        break;
      case 'chs':
        if (cycled) {
          this.rndA = this.rndB;
          this.chaos = 3.95 * this.chaos * (1 - this.chaos);
          this.rndB = this.chaos * 2 - 1;
        }
        v = this.rndA + (this.rndB - this.rndA) * p;
        break;
    }
    // delay then fade-in
    const delay = cfg.delay ? envTimeShort(cfg.delay) : 0;
    let g = 1;
    if (this.t < delay) g = 0;
    else if (cfg.fade) {
      const f = envTimeShort(cfg.fade);
      g = Math.min(1, (this.t - delay) / f);
    }
    this.value = v * g;
    return this.value;
  }
}

const envTimeShort = (v: number) => {
  const x = v / 127;
  return 5 * x * x;
};
