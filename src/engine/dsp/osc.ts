import { Rng } from './math';
import { WaveDef, getTable, readTable, Wavetable, fastSin } from './waves';

const blep = (t: number, dt: number) => {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
};

const SS_DETUNE = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01991221, 0.06216538, 0.10745242];
const PLUCK_LEN = 4096;

/**
 * One oscillator for one tone of one voice. `next(dt, pm)` advances by `dt` cycles
 * (freq / sampleRate) with optional phase modulation `pm` in cycles and returns -1..1.
 */
export class Osc {
  def!: WaveDef;
  param = 64;
  phase = 0;
  wrapped = false;
  sr = 48000;
  rng = new Rng(1234);
  // supersaw
  ssPhase = new Float64Array(7);
  // table
  table: Wavetable | null = null;
  tableLevel: Float32Array | null = null;
  tableFreq = -1;
  // fm
  modPhase = 0;
  fmTime = 0;
  // feedback
  fb1 = 0;
  fb2 = 0;
  // sync
  slave = 0;
  // pink
  b0 = 0; b1 = 0; b2 = 0;
  // pluck
  pl: Float32Array | null = null;
  plW = 0;
  plLp = 0;

  start(def: WaveDef, param: number, sr: number, seed: number, freq: number) {
    this.def = def;
    this.param = param;
    this.sr = sr;
    this.rng.s = (seed * 2654435761) >>> 0 || 1;
    this.phase = def.kind === 'blep' || def.kind === 'table' ? 0 : this.rng.uni();
    this.wrapped = false;
    this.modPhase = 0;
    this.fmTime = 0;
    this.fb1 = this.fb2 = 0;
    this.slave = 0;
    this.b0 = this.b1 = this.b2 = 0;
    if (def.kind === 'supersaw') for (let i = 0; i < 7; i++) this.ssPhase[i] = this.rng.uni();
    if (def.kind === 'table') {
      this.table = getTable(def.id);
      this.tableFreq = -1;
    }
    if (def.kind === 'pluck') {
      if (!this.pl) this.pl = new Float32Array(PLUCK_LEN);
      const pl = this.pl;
      pl.fill(0);
      const n = Math.min(PLUCK_LEN - 2, Math.max(2, Math.round(sr / Math.max(20, freq))));
      const bright = 0.15 + (param / 127) * 0.85;
      let lp = 0;
      this.plW = n;
      for (let i = 0; i < n; i++) {
        lp += (this.rng.next() - lp) * bright;
        pl[i] = lp * 1.2;
      }
      this.plLp = 0;
    }
  }

  /** Called at control rate so table mip level tracks pitch. */
  setFreq(freq: number) {
    if (this.table && Math.abs(freq - this.tableFreq) > this.tableFreq * 0.02) {
      const oct = this.def.octave ?? 0;
      this.tableLevel = this.table.levelFor(freq * Math.pow(2, oct) * 1.0, this.sr);
      this.tableFreq = freq;
    }
  }

  next(dt: number, pm: number): number {
    const def = this.def;
    switch (def.kind) {
      case 'blep': {
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        if (p >= 1) p -= Math.floor(p);
        this.phase = p;
        let q = p + pm;
        q -= Math.floor(q);
        const d = Math.min(0.5, Math.abs(dt));
        switch (def.shape) {
          case 'saw':
            return 2 * q - 1 - blep(q, d);
          case 'square': {
            let v = q < 0.5 ? 1 : -1;
            v += blep(q, d);
            let q2 = q + 0.5;
            if (q2 >= 1) q2 -= 1;
            return v - blep(q2, d);
          }
          case 'pulse': {
            const pw = 0.03 + (this.param / 127) * 0.47;
            let v = q < pw ? 1 : -1;
            v += blep(q, d);
            let q2 = q + 1 - pw;
            if (q2 >= 1) q2 -= 1;
            return (v - blep(q2, d)) * 0.9 + (1 - 2 * pw) * 0.9;
          }
          case 'tri':
            return 4 * Math.abs(q - 0.5) - 1;
          default:
            return fastSin(q);
        }
      }
      case 'supersaw': {
        const det = (this.param / 127) * 0.9 + 0.02;
        const side = 0.55;
        let s = 0;
        for (let i = 0; i < 7; i++) {
          const d = dt * (1 + SS_DETUNE[i] * det);
          let p = this.ssPhase[i] + d;
          if (p >= 1) p -= 1;
          this.ssPhase[i] = p;
          const v = 2 * p - 1 - blep(p, Math.min(0.5, d));
          s += i === 3 ? v : v * side;
        }
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        return s * 0.32;
      }
      case 'table': {
        let p = this.phase + dt * Math.pow(2, def.octave ?? 0);
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        if (!this.tableLevel) this.setFreq(dt * this.sr);
        let q = this.phase + pm;
        q -= Math.floor(q);
        return readTable(this.tableLevel!, q);
      }
      case 'fm': {
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        let m = this.modPhase + dt * (def.ratio ?? 1);
        this.modPhase = m - Math.floor(m);
        this.fmTime += 1 / this.sr;
        const bright = this.param / 64;
        let idx = (def.index ?? 1) * bright;
        if (def.indexDecay) idx *= 0.12 + 0.88 * Math.exp(-this.fmTime / def.indexDecay);
        // also reduce index at high pitch to limit aliasing
        const f = dt * this.sr;
        if (f > 1500) idx *= 1500 / f;
        return fastSin(this.phase + pm + (idx * fastSin(this.modPhase)) / (2 * Math.PI) * 1.0);
      }
      case 'feedback': {
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        const fb = (this.param / 127) * 1.6;
        const y = fastSin(this.phase + pm + (fb * (this.fb1 + this.fb2) * 0.5) / (2 * Math.PI) * Math.PI);
        this.fb2 = this.fb1;
        this.fb1 = y;
        return y;
      }
      case 'sync': {
        let p = this.phase + dt;
        const ratio = 1 + (this.param / 127) * 7;
        let s = this.slave + dt * ratio;
        if (p >= 1) {
          p -= Math.floor(p);
          s = p * ratio;
          this.wrapped = true;
        } else this.wrapped = false;
        s -= Math.floor(s);
        this.phase = p;
        this.slave = s;
        let q = s + pm;
        q -= Math.floor(q);
        if (def.shape === 'square') return q < 0.5 ? 0.8 : -0.8;
        return 2 * q - 1 - blep(q, Math.min(0.5, dt * ratio));
      }
      case 'noise': {
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        const w = this.rng.next();
        if (def.noise === 'pink') {
          this.b0 = 0.99765 * this.b0 + w * 0.099046;
          this.b1 = 0.963 * this.b1 + w * 0.2965164;
          this.b2 = 0.57 * this.b2 + w * 1.0526913;
          return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
        }
        return w * 0.7;
      }
      case 'pluck': {
        const pl = this.pl!;
        let p = this.phase + dt;
        this.wrapped = p >= 1;
        this.phase = p - Math.floor(p);
        const len = Math.min(PLUCK_LEN - 3, Math.max(2, 1 / Math.max(1e-6, dt) - 0.5));
        let r = this.plW - len;
        while (r < 0) r += PLUCK_LEN;
        const ri = r | 0;
        const fr = r - ri;
        const a = pl[ri % PLUCK_LEN];
        const b = pl[(ri + 1) % PLUCK_LEN];
        const y = a + (b - a) * fr;
        const damp = def.damping ?? 0.4;
        this.plLp += (y - this.plLp) * (1 - damp * 0.5);
        pl[this.plW] = this.plLp * 0.9985;
        this.plW = (this.plW + 1) % PLUCK_LEN;
        return y;
      }
    }
    return 0;
  }
}
