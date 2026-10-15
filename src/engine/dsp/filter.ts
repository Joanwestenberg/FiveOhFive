import type { FilterType } from '../../model/types';

/** Topology-preserving state variable filter (Zavalishin). Mono. */
export class Svf {
  ic1 = 0;
  ic2 = 0;
  a1 = 1;
  a2 = 0;
  a3 = 0;
  k = 2;
  reset() {
    this.ic1 = this.ic2 = 0;
  }
  set(hz: number, q01: number, sr: number) {
    const f = Math.min(hz, sr * 0.45);
    const g = Math.tan((Math.PI * Math.max(10, f)) / sr);
    // q01 0..1 → damping 2..~0.03 (self-oscillation at the top)
    const k = 2 - 1.97 * Math.min(1, Math.max(0, q01));
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  /** Returns lowpass; band and high are written to fields. */
  lp = 0;
  bp = 0;
  hp = 0;
  tick(x: number) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    // keep states bounded at extreme resonance
    if (this.ic1 > 8) this.ic1 = 8; else if (this.ic1 < -8) this.ic1 = -8;
    if (this.ic2 > 8) this.ic2 = 8; else if (this.ic2 < -8) this.ic2 = -8;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

/** The TVF: one or two SVF stages selected by filter type. */
export class Tvf {
  a = new Svf();
  b = new Svf();
  type: FilterType = 'lpf';
  res = 0;
  reset() {
    this.a.reset();
    this.b.reset();
  }
  set(type: FilterType, hz: number, res01: number, sr: number) {
    this.type = type;
    this.res = res01;
    if (type === 'lpf24') {
      this.a.set(hz, res01 * 0.85, sr);
      this.b.set(hz, 0.08, sr);
    } else this.a.set(hz, type === 'pkg' ? 0.3 : res01, sr);
  }
  process(x: number) {
    switch (this.type) {
      case 'off':
        return x;
      case 'lpf':
        return this.a.tick(x);
      case 'lpf24':
        return this.b.tick(this.a.tick(x) * (1 + this.res * 0.6));
      case 'bpf':
        this.a.tick(x);
        return this.a.bp * (1 + this.res);
      case 'hpf':
        this.a.tick(x);
        return this.a.hp;
      case 'pkg':
        this.a.tick(x);
        return x + this.a.bp * this.res * 6;
    }
    return x;
  }
}

/** RBJ biquad for EQ duties. */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  setLowShelf(hz: number, db: number, sr: number) {
    const A = Math.pow(10, db / 40);
    const w = (2 * Math.PI * hz) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = (sn / 2) * Math.sqrt(2);
    const sa = 2 * Math.sqrt(A) * alpha;
    const a0 = A + 1 + (A - 1) * cs + sa;
    this.b0 = (A * (A + 1 - (A - 1) * cs + sa)) / a0;
    this.b1 = (2 * A * (A - 1 - (A + 1) * cs)) / a0;
    this.b2 = (A * (A + 1 - (A - 1) * cs - sa)) / a0;
    this.a1 = (-2 * (A - 1 + (A + 1) * cs)) / a0;
    this.a2 = (A + 1 + (A - 1) * cs - sa) / a0;
  }
  setHighShelf(hz: number, db: number, sr: number) {
    const A = Math.pow(10, db / 40);
    const w = (2 * Math.PI * hz) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = (sn / 2) * Math.sqrt(2);
    const sa = 2 * Math.sqrt(A) * alpha;
    const a0 = A + 1 - (A - 1) * cs + sa;
    this.b0 = (A * (A + 1 + (A - 1) * cs + sa)) / a0;
    this.b1 = (-2 * A * (A - 1 + (A + 1) * cs)) / a0;
    this.b2 = (A * (A + 1 + (A - 1) * cs - sa)) / a0;
    this.a1 = (2 * (A - 1 - (A + 1) * cs)) / a0;
    this.a2 = (A + 1 - (A - 1) * cs - sa) / a0;
  }
  setPeak(hz: number, db: number, q: number, sr: number) {
    const A = Math.pow(10, db / 40);
    const w = (2 * Math.PI * hz) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cs = Math.cos(w);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cs) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }
  setBandpass(hz: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cs = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setHighpass(hz: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cs = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 + cs) / 2 / a0;
    this.b1 = -(1 + cs) / a0;
    this.b2 = (1 + cs) / 2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  setLowpass(hz: number, q: number, sr: number) {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const cs = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 - cs) / 2 / a0;
    this.b1 = (1 - cs) / a0;
    this.b2 = (1 - cs) / 2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  tick(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}
