import type { DelaySetup, EfxSetup, EfxType, ReverbSetup, SyncValue } from '../../model/types';
import { efxParam, RATE_OPTIONS } from '../../model/efxDefs';
import { Biquad, Svf } from './filter';
import { clamp, cutoffHz, onePoleCoef, Rng, softClip, SYNC_BEATS, TAU } from './math';

// ------------------------------------------------------------------ delay line

class DelayLine {
  buf: Float32Array;
  w = 0;
  constructor(len: number) {
    this.buf = new Float32Array(len);
  }
  write(x: number) {
    this.buf[this.w] = x;
    this.w = this.w + 1 === this.buf.length ? 0 : this.w + 1;
  }
  /** Read `d` samples behind the last write (fractional). */
  read(d: number) {
    const n = this.buf.length;
    let r = this.w - 1 - d;
    while (r < 0) r += n;
    const i = r | 0;
    const f = r - i;
    const a = this.buf[i];
    const b = this.buf[i + 1 === n ? 0 : i + 1];
    return a + (b - a) * f;
  }
  clear() {
    this.buf.fill(0);
  }
}

// ------------------------------------------------------------------ reverb

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const APS = [556, 441, 341, 225];
const SPREAD = 23;

class Comb {
  buf: Float32Array;
  len: number;
  i = 0;
  store = 0;
  constructor(max: number) {
    this.buf = new Float32Array(max);
    this.len = max;
  }
  tick(x: number, fb: number, d1: number) {
    const out = this.buf[this.i];
    this.store = out * (1 - d1) + this.store * d1;
    if (Math.abs(this.store) < 1e-18) this.store = 0;
    this.buf[this.i] = x + this.store * fb;
    if (++this.i >= this.len) this.i = 0;
    return out;
  }
}
class Allpass {
  buf: Float32Array;
  len: number;
  i = 0;
  constructor(max: number) {
    this.buf = new Float32Array(max);
    this.len = max;
  }
  tick(x: number) {
    const b = this.buf[this.i];
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.len) this.i = 0;
    return b - x;
  }
}

const REVERB_TYPES: Record<string, { size: number; damp: number; pre: number }> = {
  room1: { size: 0.45, damp: 0.5, pre: 0 },
  room2: { size: 0.62, damp: 0.45, pre: 4 },
  stage: { size: 0.75, damp: 0.35, pre: 10 },
  hall1: { size: 0.88, damp: 0.4, pre: 18 },
  hall2: { size: 1.0, damp: 0.5, pre: 30 },
  plate: { size: 0.8, damp: 0.15, pre: 2 },
};

export class Reverb {
  sr: number;
  cl: Comb[];
  cr: Comb[];
  al: Allpass[];
  ar: Allpass[];
  pre: DelayLine;
  echoL: DelayLine;
  echoR: DelayLine;
  echoLp = [0, 0];
  cfg: ReverbSetup | null = null;
  fb = 0.8;
  damp = 0.4;
  preSamp = 0;
  constructor(sr: number) {
    this.sr = sr;
    const s = sr / 44100;
    this.cl = COMBS.map((c) => new Comb(Math.round(c * s)));
    this.cr = COMBS.map((c) => new Comb(Math.round((c + SPREAD) * s)));
    this.al = APS.map((c) => new Allpass(Math.round(c * s)));
    this.ar = APS.map((c) => new Allpass(Math.round((c + SPREAD) * s)));
    this.pre = new DelayLine(Math.round(sr * 0.25));
    this.echoL = new DelayLine(Math.round(sr * 1.2));
    this.echoR = new DelayLine(Math.round(sr * 1.2));
  }
  set(cfg: ReverbSetup) {
    this.cfg = cfg;
    const t = REVERB_TYPES[cfg.type] ?? REVERB_TYPES.room2;
    const s = this.sr / 44100;
    for (let k = 0; k < 8; k++) {
      this.cl[k].len = Math.max(8, Math.round(COMBS[k] * s * (0.55 + 0.45 * t.size)));
      this.cr[k].len = Math.max(8, Math.round((COMBS[k] + SPREAD) * s * (0.55 + 0.45 * t.size)));
      if (this.cl[k].i >= this.cl[k].len) this.cl[k].i = 0;
      if (this.cr[k].i >= this.cr[k].len) this.cr[k].i = 0;
    }
    const time = cfg.time / 127;
    this.fb = 0.7 + 0.285 * Math.pow(time, 0.7) * (0.85 + 0.15 * t.size);
    this.damp = clamp(t.damp * 0.5 + (cfg.hfDamp / 127) * 0.55, 0, 0.95);
    this.preSamp = Math.round(((cfg.preDelay / 127) * 200 + t.pre) * 0.001 * this.sr);
  }
  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number) {
    const cfg = this.cfg!;
    const lvl = (cfg.level / 127) ** 2;
    if (cfg.type === 'delay' || cfg.type === 'panDelay') {
      const d = (0.01 + (cfg.time / 127) * 0.99) * this.sr;
      const fb = (cfg.preDelay / 127) * 0.85;
      const c = onePoleCoef(1000 + (1 - cfg.hfDamp / 127) * 15000, this.sr);
      for (let i = 0; i < n; i++) {
        const x = (inL[i] + inR[i]) * 0.5;
        const yl = this.echoL.read(d);
        const yr = this.echoR.read(cfg.type === 'panDelay' ? d * 0.5 : d);
        this.echoLp[0] += (yl - this.echoLp[0]) * c;
        this.echoLp[1] += (yr - this.echoLp[1]) * c;
        if (cfg.type === 'panDelay') {
          this.echoL.write(x + this.echoLp[1] * fb);
          this.echoR.write(this.echoLp[0] * fb);
        } else {
          this.echoL.write(x + this.echoLp[0] * fb);
          this.echoR.write(x + this.echoLp[1] * fb);
        }
        outL[i] += yl * lvl;
        outR[i] += yr * lvl;
      }
      return;
    }
    const fb = this.fb;
    const d1 = this.damp;
    for (let i = 0; i < n; i++) {
      this.pre.write((inL[i] + inR[i]) * 0.5);
      const x = this.pre.read(this.preSamp) * 0.03;
      let l = 0;
      let r = 0;
      for (let k = 0; k < 8; k++) {
        l += this.cl[k].tick(x, fb, d1);
        r += this.cr[k].tick(x, fb, d1);
      }
      for (let k = 0; k < 4; k++) {
        l = this.al[k].tick(l);
        r = this.ar[k].tick(r);
      }
      outL[i] += l * lvl * 1.1;
      outR[i] += r * lvl * 1.1;
    }
  }
}

// ------------------------------------------------------------------ delay

export class StereoDelay {
  sr: number;
  l: DelayLine;
  r: DelayLine;
  cfg: DelaySetup | null = null;
  cur = 0.3;
  lpL = 0;
  lpR = 0;
  constructor(sr: number) {
    this.sr = sr;
    this.l = new DelayLine(Math.round(sr * 3));
    this.r = new DelayLine(Math.round(sr * 3));
  }
  set(cfg: DelaySetup) {
    this.cfg = cfg;
  }
  timeSec(bpm: number) {
    const cfg = this.cfg!;
    const beats = SYNC_BEATS[cfg.sync];
    const t = beats ? (60 / bpm) * beats : cfg.timeMs / 1000;
    return clamp(t, 0.001, 2.9);
  }
  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number, bpm: number, revL: Float32Array, revR: Float32Array) {
    const cfg = this.cfg!;
    const target = this.timeSec(bpm) * this.sr;
    const fb = (cfg.feedback / 127) * 0.95;
    const c = onePoleCoef(800 + (1 - cfg.hfDamp / 127) * 16000, this.sr);
    const lvl = (cfg.level / 127) ** 2;
    const toRev = (cfg.toReverb / 127) ** 2;
    const smooth = 1 - Math.exp(-1 / (0.05 * this.sr));
    for (let i = 0; i < n; i++) {
      this.cur += (target - this.cur) * smooth;
      const d = this.cur;
      const yl = this.l.read(d);
      const yr = this.r.read(d);
      this.lpL += (yl - this.lpL) * c;
      this.lpR += (yr - this.lpR) * c;
      const xl = inL[i];
      const xr = inR[i];
      switch (cfg.type) {
        case 'mono': {
          const m = (xl + xr) * 0.5 + this.lpL * fb;
          this.l.write(m);
          this.r.write(m);
          break;
        }
        case 'stereo':
          this.l.write(xl + this.lpL * fb);
          this.r.write(xr + this.lpR * fb);
          break;
        default:
          // ping-pong: input enters left, bounces across
          this.l.write((xl + xr) * 0.5 + this.lpR * fb);
          this.r.write(this.lpL * fb);
      }
      const ol = (cfg.type === 'mono' ? yl : yl) * lvl;
      const or = (cfg.type === 'mono' ? yl : yr) * lvl;
      outL[i] += ol;
      outR[i] += or;
      revL[i] += ol * toRev;
      revR[i] += or * toRev;
    }
  }
}

// ------------------------------------------------------------------ EFX

const syncBeats = (idx: number) => SYNC_BEATS[(RATE_OPTIONS[idx] ?? 'off') as SyncValue] ?? 0;
const lfoWave = (w: number, p: number) => {
  switch (w) {
    case 0: return 1 - 4 * Math.abs(p - 0.5);
    case 1: return p < 0.5 ? 1 : -1;
    case 2: return Math.sin(p * TAU);
    case 3: return 2 * p - 1;
    default: return 1 - 2 * p;
  }
};
const freeHz = (v: number) => 0.05 * Math.pow(2, (v / 127) * 8);

export class Efx {
  sr: number;
  cfg: EfxSetup | null = null;
  type: EfxType = 'isolator';
  rng = new Rng(99);
  // shared state
  svf = [new Svf(), new Svf(), new Svf(), new Svf()];
  bq: Biquad[] = Array.from({ length: 8 }, () => new Biquad());
  dl = [new DelayLine(0), new DelayLine(0), new DelayLine(0), new DelayLine(0)];
  lfo = 0;
  lfo2 = 0;
  env = 0;
  hold = [0, 0];
  holdCnt = 0;
  smooth = 0;
  smooth2 = 0;
  ap: Float64Array = new Float64Array(48); // all-pass x1/y1 states
  fbL = 0;
  fbR = 0;
  lpL = 0;
  lpR = 0;
  ringPh = 0;
  rotHorn = 0;
  rotDrum = 0;
  rotSpeed = 0.8;
  psPhase = 0;
  ctr = 0;
  coef = 0;
  coefR = 0;
  ps: number[] = [];

  constructor(sr: number) {
    this.sr = sr;
    const len = Math.round(sr * 2.2);
    this.dl = [new DelayLine(len), new DelayLine(len), new DelayLine(Math.round(sr * 0.1)), new DelayLine(Math.round(sr * 0.1))];
  }

  set(cfg: EfxSetup) {
    if (cfg.type !== this.type) this.reset();
    this.cfg = cfg;
    this.type = cfg.type;
    const P = (k: string) => efxParam(cfg.params, cfg.type, k);
    const sr = this.sr;
    switch (cfg.type) {
      case 'eq': {
        this.bq[0].setLowShelf(120, P('lowGain'), sr);
        this.bq[1].setLowShelf(120, P('lowGain'), sr);
        const f1 = 100 * Math.pow(20, P('mid1Freq') / 127);
        const f2 = 1000 * Math.pow(10, P('mid2Freq') / 127);
        this.bq[2].setPeak(f1, P('mid1Gain'), 1, sr);
        this.bq[3].setPeak(f1, P('mid1Gain'), 1, sr);
        this.bq[4].setPeak(f2, P('mid2Gain'), 1, sr);
        this.bq[5].setPeak(f2, P('mid2Gain'), 1, sr);
        this.bq[6].setHighShelf(8000, P('highGain'), sr);
        this.bq[7].setHighShelf(8000, P('highGain'), sr);
        break;
      }
      case 'isolator':
        this.svf[0].set(250, 0, sr);
        this.svf[1].set(250, 0, sr);
        this.svf[2].set(3000, 0, sr);
        this.svf[3].set(3000, 0, sr);
        break;
      case 'radio': {
        const f = 300 * Math.pow(10, P('tune') / 127);
        this.bq[0].setBandpass(f, 2.5, sr);
        this.bq[1].setBandpass(f, 2.5, sr);
        this.bq[2].setHighpass(250, 0.7, sr);
        this.bq[3].setHighpass(250, 0.7, sr);
        break;
      }
      case 'enhancer': {
        const f = 1500 * Math.pow(6, P('freq') / 127);
        this.bq[0].setHighpass(f, 0.7, sr);
        this.bq[1].setHighpass(f, 0.7, sr);
        this.bq[2].setHighpass(f, 0.7, sr);
        this.bq[3].setHighpass(f, 0.7, sr);
        break;
      }
      case 'rotary':
        this.svf[0].set(800, 0, sr);
        this.svf[1].set(800, 0, sr);
        break;
    }
  }

  private stepCache: number[] = [];
  private stepSrc: Record<string, number> | null = null;
  steps(cfg: EfxSetup) {
    if (this.stepSrc !== cfg.params || this.stepCache.length !== 16) {
      this.stepSrc = cfg.params;
      this.stepCache = Array.from({ length: 16 }, (_, k) => efxParam(cfg.params, cfg.type, `s${k + 1}`));
    }
    return this.stepCache;
  }

  reset() {
    for (const s of this.svf) s.reset();
    for (const b of this.bq) b.reset();
    for (const d of this.dl) d.clear();
    this.ap.fill(0);
    this.fbL = this.fbR = this.lpL = this.lpR = this.env = 0;
  }

  /** Process in place-free: reads in*, adds to out* with level. beat = beat position at block start. */
  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number, bpm: number, beat: number) {
    const cfg = this.cfg;
    if (!cfg) return;
    const P = (k: string) => efxParam(cfg.params, cfg.type, k);
    const sr = this.sr;
    const out = (cfg.level / 127) ** 2;
    const beatInc = bpm / 60 / sr;
    const S = this.steps(cfg);
    const rate = (key = 'rate', syncKey = 'sync') => {
      const sb = syncBeats(P(syncKey));
      return sb ? bpm / 60 / sb : freeHz(P(key));
    };
    const stepAt = (b: number, syncKey: string) => {
      const sb = syncBeats(P(syncKey)) || 0.25;
      return Math.floor(b / sb) & 15;
    };
    switch (cfg.type) {
      case 'isolator': {
        const g = (v: number) => (v <= 100 ? (v / 100) ** 2 : 1 + (v - 100) / 27);
        const gl = g(P('low'));
        const gm = g(P('mid'));
        const gh = g(P('high'));
        for (let i = 0; i < n; i++) {
          for (let c = 0; c < 2; c++) {
            const x = c ? inR[i] : inL[i];
            const lo = this.svf[c].tick(x);
            this.svf[2 + c].tick(x);
            const hi = this.svf[2 + c].hp;
            const mid = x - lo - hi;
            const y = (lo * gl + mid * gm + hi * gh) * out;
            if (c) outR[i] += y; else outL[i] += y;
          }
        }
        return;
      }
      case 'superFilter':
      case 'stepFilter':
      case 'autoWah': {
        const ft = P('ftype');
        const res = P('resonance') / 127;
        const hz = cfg.type === 'superFilter' ? rate() : cfg.type === 'autoWah' ? rate() : 0;
        const gain = cfg.type === 'superFilter' ? Math.pow(10, ((P('gain') - 64) / 63) * 12 / 20) : cfg.type === 'stepFilter' ? 1.2 : 1;
        let b = beat;
        const glide = cfg.type === 'stepFilter' ? onePoleCoef(2 + (1 - P('glide') / 127) * 200, sr) : 0;
        for (let i = 0; i < n; i++) {
          if ((this.ctr++ & 7) === 0) {
            let u = 0;
            if (cfg.type === 'superFilter') {
              this.lfo = (this.lfo + (hz * 8) / sr) % 1;
              const mod = P('mod') ? lfoWave(P('wave'), this.lfo) * (P('depth') / 127) * 50 : 0;
              u = P('cutoff') + mod;
            } else if (cfg.type === 'stepFilter') {
              const st = stepAt(b, 'sync');
              const target = P('base') + (S[st] / 127) * P('depth') * 0.8;
              this.smooth += (target - this.smooth) * Math.min(1, glide * 8);
              u = this.smooth;
            } else {
              this.lfo = (this.lfo + (hz * 8) / sr) % 1;
              u = P('manual') + this.env * P('sens') * 0.9 + Math.sin(this.lfo * TAU) * P('depth') * 0.3;
            }
            const f = clamp(cutoffHz(u), 30, 18000);
            this.svf[0].set(f, res * 0.95, sr);
            this.svf[1].set(f, res * 0.95, sr);
            this.svf[2].set(f, 0.05, sr);
            this.svf[3].set(f, 0.05, sr);
          }
          b += beatInc;
          const ax = Math.abs(inL[i]) + Math.abs(inR[i]);
          this.env += (ax - this.env) * (ax > this.env ? 0.01 : 0.0005);
          for (let c = 0; c < 2; c++) {
            const x = c ? inR[i] : inL[i];
            const s1 = this.svf[c];
            const s2 = this.svf[2 + c];
            s1.tick(x);
            let y: number;
            if (cfg.type === 'autoWah') y = ft === 0 ? s1.lp : s1.bp * 1.5;
            else if (ft === 0) y = s2.tick(s1.lp);
            else if (ft === 1) { s2.tick(s1.bp); y = s2.bp * 2; }
            else if (ft === 2) { s2.tick(s1.hp); y = s2.hp; }
            else y = s1.lp + s1.hp;
            y *= gain * out;
            if (c) outR[i] += y; else outL[i] += y;
          }
        }
        return;
      }
      case 'loFi': {
        const bits = 1 + (P('bits') / 127) * 15;
        const q = Math.pow(2, bits - 1);
        const down = Math.max(1, Math.round(1 + Math.pow(P('rate') / 127, 2) * 31));
        const c = onePoleCoef(300 + Math.pow(P('tone') / 127, 2) * 16000, sr);
        const nz = (P('noise') / 127) * 0.05;
        const mix = P('mix') / 127;
        for (let i = 0; i < n; i++) {
          if (this.holdCnt-- <= 0) {
            this.holdCnt = down - 1;
            this.hold[0] = Math.round(inL[i] * q) / q;
            this.hold[1] = Math.round(inR[i] * q) / q;
          }
          this.lpL += (this.hold[0] + this.rng.next() * nz - this.lpL) * c;
          this.lpR += (this.hold[1] + this.rng.next() * nz - this.lpR) * c;
          outL[i] += (inL[i] * (1 - mix) + this.lpL * mix) * out;
          outR[i] += (inR[i] * (1 - mix) + this.lpR * mix) * out;
        }
        return;
      }
      case 'distortion':
      case 'overdrive': {
        const dist = cfg.type === 'distortion';
        const drive = 1 + Math.pow(P('drive') / 127, 2) * (dist ? 80 : 25);
        const c = onePoleCoef(600 + Math.pow(P('tone') / 127, 2) * 14000, sr);
        const lv = (P('level') / 127) ** 2 * (dist ? 0.7 : 0.9);
        for (let i = 0; i < n; i++) {
          const xl = inL[i] * drive;
          const xr = inR[i] * drive;
          const yl = dist ? clamp(xl, -1, 1) : softClip(xl + 0.1 * xl * xl) ;
          const yr = dist ? clamp(xr, -1, 1) : softClip(xr + 0.1 * xr * xr);
          this.lpL += (yl - this.lpL) * c;
          this.lpR += (yr - this.lpR) * c;
          outL[i] += this.lpL * lv * out;
          outR[i] += this.lpR * lv * out;
        }
        return;
      }
      case 'compressor': {
        const thrDb = -(P('threshold') / 127) * 40;
        const ratio = 1 + (P('ratio') / 127) * 19;
        const att = Math.exp(-1 / (sr * (0.0005 + (P('attack') / 127) * 0.08)));
        const rel = Math.exp(-1 / (sr * (0.02 + (P('release') / 127) * 0.8)));
        const makeup = Math.pow(10, (-thrDb * (1 - 1 / ratio) * 0.5 + ((P('gain') - 64) / 63) * 12) / 20);
        for (let i = 0; i < n; i++) {
          const x = Math.max(Math.abs(inL[i]), Math.abs(inR[i]));
          this.env = x > this.env ? att * this.env + (1 - att) * x : rel * this.env + (1 - rel) * x;
          const db = 20 * Math.log10(this.env + 1e-9);
          const over = db - thrDb;
          const gr = over > 0 ? Math.pow(10, (-over * (1 - 1 / ratio)) / 20) : 1;
          const g = gr * makeup * out;
          outL[i] += inL[i] * g;
          outR[i] += inR[i] * g;
        }
        return;
      }
      case 'phaser':
      case 'stepPhaser': {
        const stages = [4, 8, 12][P('stages') ?? 1] ?? 8;
        const hz = rate();
        const depth = P('depth') / 127;
        const fb = (P('resonance') / 127) * 0.9;
        const mix = P('mix') / 127;
        const base = 200 * Math.pow(20, P('manual') / 127);
        let b = beat;
        for (let i = 0; i < n; i++) {
          if ((this.ctr++ & 15) === 0) {
            this.lfo = (this.lfo + (hz * 16) / sr) % 1;
            let m = Math.sin(this.lfo * TAU);
            if (cfg.type === 'stepPhaser') {
              const st = stepAt(b, 'step');
              if (st !== this.holdCnt) {
                this.holdCnt = st;
                this.smooth = m;
              }
              m = this.smooth;
            }
            const fl = clamp(base * Math.pow(4, m * depth), 40, 16000);
            const fr = clamp(base * Math.pow(4, -m * depth * 0.7), 40, 16000);
            const tl = Math.tan((Math.PI * fl) / sr);
            const tr = Math.tan((Math.PI * fr) / sr);
            this.coef = (tl - 1) / (tl + 1);
            this.coefR = (tr - 1) / (tr + 1);
          }
          b += beatInc * 16 / 16;
          for (let c = 0; c < 2; c++) {
            const a = c ? this.coefR : this.coef;
            let x = (c ? inR[i] : inL[i]) + (c ? this.fbR : this.fbL) * fb;
            const o = c * 24;
            for (let s = 0; s < stages; s++) {
              const x1 = this.ap[o + s * 2];
              const y1 = this.ap[o + s * 2 + 1];
              const y = a * x + x1 - a * y1;
              this.ap[o + s * 2] = x;
              this.ap[o + s * 2 + 1] = y;
              x = y;
            }
            if (c) this.fbR = x; else this.fbL = x;
            const dry = c ? inR[i] : inL[i];
            const y = (dry + x * mix) * 0.7 * out;
            if (c) outR[i] += y; else outL[i] += y;
          }
        }
        return;
      }
      case 'flanger':
      case 'stepFlanger':
      case 'chorus':
      case 'spaceD': {
        const t = cfg.type;
        const hz = t === 'stepFlanger' ? 0 : t === 'flanger' ? rate() : freeHz(P('rate')) * 0.6;
        const depth = P('depth') / 127;
        const mix = P('mix') / 127;
        const fb = t === 'flanger' || t === 'stepFlanger' ? ((P('feedback') - 64) / 64) * 0.92 : t === 'chorus' ? (P('feedback') / 127) * 0.6 : 0;
        const baseMs = t === 'chorus' || t === 'spaceD' ? 6 + (t === 'chorus' ? P('delay') / 127 : 0.5) * 20 : 0.3 + (P('delay') / 127) * 8;
        const modMs = t === 'chorus' || t === 'spaceD' ? 4 * depth : 5 * depth;
        let b = beat;
        for (let i = 0; i < n; i++) {
          this.lfo = (this.lfo + hz / sr) % 1;
          let ml: number;
          let mr: number;
          if (t === 'stepFlanger') {
            const st = stepAt(b, 'step');
            const target = S[st] / 127;
            this.smooth += (target - this.smooth) * 0.002;
            ml = mr = this.smooth * 2 - 1;
          } else {
            ml = Math.sin(this.lfo * TAU);
            mr = Math.sin((this.lfo + 0.25) * TAU);
          }
          b += beatInc;
          const dL = ((baseMs + modMs * (0.5 + 0.5 * ml)) * sr) / 1000;
          const dR = ((baseMs + modMs * (0.5 + 0.5 * mr)) * sr) / 1000;
          let yl: number;
          let yr: number;
          if (t === 'spaceD') {
            const dC = ((baseMs + modMs * 0.5 * (0.5 + 0.5 * Math.sin((this.lfo + 0.5) * TAU))) * sr) / 1000;
            this.dl[2].write((inL[i] + inR[i]) * 0.5);
            yl = this.dl[2].read(dL) * 0.7 + this.dl[2].read(dC) * 0.3;
            yr = this.dl[2].read(dR) * 0.7 + this.dl[2].read(dC) * 0.3;
          } else {
            yl = this.dl[2].read(dL);
            yr = this.dl[3].read(dR);
            this.dl[2].write(inL[i] + yl * fb);
            this.dl[3].write(inR[i] + yr * fb);
          }
          outL[i] += (inL[i] * (1 - mix * 0.5) + yl * mix) * 0.8 * out;
          outR[i] += (inR[i] * (1 - mix * 0.5) + yr * mix) * 0.8 * out;
        }
        return;
      }
      case 'tremolo':
      case 'autoPan': {
        const hz = rate();
        const depth = P('depth') / 127;
        const w = P('wave');
        for (let i = 0; i < n; i++) {
          this.lfo = (this.lfo + hz / sr) % 1;
          const m = lfoWave(w, this.lfo);
          if (cfg.type === 'tremolo') {
            const g = (1 - depth * (0.5 - 0.5 * m)) * out;
            outL[i] += inL[i] * g;
            outR[i] += inR[i] * g;
          } else {
            const pan = m * depth;
            outL[i] += inL[i] * Math.min(1, 1 - pan) * out;
            outR[i] += inR[i] * Math.min(1, 1 + pan) * out;
          }
        }
        return;
      }
      case 'slicer': {
        const sb = syncBeats(P('sync')) || 0.25;
        const depth = P('depth') / 127;
        const c = onePoleCoef(20 + (1 - P('attack') / 127) * 600, sr);
        const shuffle = (P('shuffle') / 127) * 0.5;
        let b = beat;
        for (let i = 0; i < n; i++) {
          const pos = b / sb;
          let st = Math.floor(pos);
          let frac = pos - st;
          if (st & 1) {
            frac -= shuffle;
            if (frac < 0) { st -= 1; frac += 1; }
          }
          const on = S[st & 15] / 127;
          const gate = frac < 0.85 ? on : 0;
          this.smooth += (gate - this.smooth) * c;
          const g = (1 - depth + depth * this.smooth) * out;
          outL[i] += inL[i] * g;
          outR[i] += inR[i] * g;
          b += beatInc;
        }
        return;
      }
      case 'ringMod':
      case 'stepRingMod': {
        const mix = P('mix') / 127;
        let b = beat;
        const glide = cfg.type === 'stepRingMod' ? onePoleCoef(2 + (1 - P('glide') / 127) * 300, sr) : 1;
        for (let i = 0; i < n; i++) {
          let fu: number;
          if (cfg.type === 'ringMod') {
            const ax = Math.abs(inL[i]) + Math.abs(inR[i]);
            this.env += (ax - this.env) * 0.001;
            fu = P('freq') + this.env * P('sens') * 0.8;
          } else {
            const st = stepAt(b, 'sync');
            this.smooth += (S[st] - this.smooth) * glide;
            fu = this.smooth;
          }
          b += beatInc;
          const f = 20 * Math.pow(2, (fu / 127) * 9);
          this.ringPh = (this.ringPh + f / sr) % 1;
          const m = Math.sin(this.ringPh * TAU);
          outL[i] += (inL[i] * (1 - mix) + inL[i] * m * mix) * out;
          outR[i] += (inR[i] * (1 - mix) + inR[i] * m * mix) * out;
        }
        return;
      }
      case 'rotary': {
        const fast = P('speed') > 0;
        const target = fast ? 6.6 : 0.75;
        const acc = 0.00002 + (P('accel') / 127) * 0.0003;
        const drive = 1 + (P('drive') / 127) * 6;
        const bal = P('balance') / 127;
        for (let i = 0; i < n; i++) {
          this.rotSpeed += (target - this.rotSpeed) * acc;
          this.rotHorn = (this.rotHorn + this.rotSpeed / sr) % 1;
          this.rotDrum = (this.rotDrum + (this.rotSpeed * 0.86) / sr) % 1;
          const x = softClip(((inL[i] + inR[i]) * 0.5) * drive) / Math.sqrt(drive);
          const lo = this.svf[0].tick(x);
          const hi = x - lo;
          const hs = Math.sin(this.rotHorn * TAU);
          const hc = Math.cos(this.rotHorn * TAU);
          const ds = Math.sin(this.rotDrum * TAU);
          this.dl[2].write(hi);
          const hl = this.dl[2].read(((1.2 + hs * 0.6) * sr) / 1000) * (0.75 + 0.25 * hc);
          const hr = this.dl[2].read(((1.2 - hs * 0.6) * sr) / 1000) * (0.75 - 0.25 * hc);
          const dlv = lo * (0.85 + 0.15 * ds);
          const drv = lo * (0.85 - 0.15 * ds);
          outL[i] += (hl * bal + dlv * (1 - bal)) * 1.3 * out;
          outR[i] += (hr * bal + drv * (1 - bal)) * 1.3 * out;
        }
        return;
      }
      case 'enhancer': {
        const sens = (P('sens') / 127) * 2;
        const mix = P('mix') / 127;
        for (let i = 0; i < n; i++) {
          const hl = this.bq[0].tick(inL[i]);
          const hr = this.bq[1].tick(inR[i]);
          const el = this.bq[2].tick(Math.abs(hl) * sens + softClip(hl * 4) * 0.3);
          const er = this.bq[3].tick(Math.abs(hr) * sens + softClip(hr * 4) * 0.3);
          outL[i] += (inL[i] + el * mix) * out;
          outR[i] += (inR[i] + er * mix) * out;
        }
        return;
      }
      case 'bpmDelay': {
        const beats = syncBeats(P('time')) || 0.5;
        const d = Math.min(sr * 2.1, ((60 / bpm) * beats) * sr);
        const fb = (P('feedback') / 127) * 0.93;
        const c = onePoleCoef(800 + (1 - P('damp') / 127) * 15000, sr);
        const mix = P('mix') / 127;
        const ping = P('mode') === 1;
        for (let i = 0; i < n; i++) {
          const yl = this.dl[0].read(d);
          const yr = this.dl[1].read(d);
          this.lpL += (yl - this.lpL) * c;
          this.lpR += (yr - this.lpR) * c;
          if (ping) {
            this.dl[0].write((inL[i] + inR[i]) * 0.5 + this.lpR * fb);
            this.dl[1].write(this.lpL * fb);
          } else {
            this.dl[0].write(inL[i] + this.lpL * fb);
            this.dl[1].write(inR[i] + this.lpR * fb);
          }
          outL[i] += (inL[i] + yl * mix) * out;
          outR[i] += (inR[i] + yr * mix) * out;
        }
        return;
      }
      case 'pitchShifter': {
        const ratio = Math.pow(2, (P('pitch') + P('fine') / 100) / 12);
        const win = 0.06 * sr;
        const fb = (P('feedback') / 127) * 0.8;
        const mix = P('mix') / 127;
        const inc = (1 - ratio) / win;
        for (let i = 0; i < n; i++) {
          this.psPhase += inc;
          this.psPhase -= Math.floor(this.psPhase);
          const p1 = this.psPhase;
          const p2 = (p1 + 0.5) % 1;
          const w1 = Math.sin(p1 * Math.PI);
          const w2 = Math.sin(p2 * Math.PI);
          for (let c = 0; c < 2; c++) {
            const dline = this.dl[c];
            const y = dline.read(p1 * win + 2) * w1 + dline.read(p2 * win + 2) * w2;
            const x = c ? inR[i] : inL[i];
            dline.write(x + y * fb);
            const o = (x * (1 - mix) + y * mix) * out;
            if (c) outR[i] += o; else outL[i] += o;
          }
        }
        return;
      }
      case 'radio': {
        const nz = (P('noise') / 127) * 0.15;
        const drive = 1 + (P('drive') / 127) * 10;
        const mix = P('mix') / 127;
        for (let i = 0; i < n; i++) {
          const crackle = this.rng.uni() > 0.9995 ? this.rng.next() * 0.5 : 0;
          const m = (inL[i] + inR[i]) * 0.5;
          let y = this.bq[0].tick(m * 2) + (this.rng.next() * nz + crackle) * 0.5;
          y = this.bq[2].tick(softClip(y * drive) / Math.sqrt(drive));
          outL[i] += (inL[i] * (1 - mix) + y * mix * 1.5) * out;
          outR[i] += (inR[i] * (1 - mix) + y * mix * 1.5) * out;
        }
        return;
      }
      case 'eq': {
        for (let i = 0; i < n; i++) {
          let l = inL[i];
          let r = inR[i];
          l = this.bq[6].tick(this.bq[4].tick(this.bq[2].tick(this.bq[0].tick(l))));
          r = this.bq[7].tick(this.bq[5].tick(this.bq[3].tick(this.bq[1].tick(r))));
          outL[i] += l * out;
          outR[i] += r * out;
        }
        return;
      }
    }
  }
}
