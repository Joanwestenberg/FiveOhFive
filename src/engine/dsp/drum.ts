import type { DrumInst } from '../../model/types';
import { Biquad, Svf } from './filter';
import { clamp, level, panL, panR, Rng, softClip } from './math';
import { Osc } from './osc';
import { waveDef } from './waves';
import type { PartRt } from './voice';

const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];

/**
 * Synthesised drum voice. Each model is an analog-style recipe (TR-808/909 flavoured)
 * controlled by four macro parameters: tune, decay, tone and snap.
 */
export class DrumVoice {
  free = true;
  part: PartRt | null = null;
  inst!: DrumInst;
  note = 36;
  sr = 48000;
  t = 0; // samples since start
  rng = new Rng(3);
  vel = 1;
  // generic state
  ph = new Float64Array(6);
  f1 = new Svf();
  f2 = new Svf();
  bq = new Biquad();
  bq2 = new Biquad();
  env = 1;
  env2 = 1;
  envNoise = 1;
  dec = 0.999; // per-sample multipliers
  dec2 = 0.999;
  decN = 0.999;
  freq = 100;
  sweep = 0;
  sweepDec = 0.999;
  fadeOut = 0;
  fadeLen = 0;
  osc = new Osc();
  gainL = 0;
  gainR = 0;
  revG = 0;
  dlyG = 0;
  drive = 1;
  speed = 1;

  start(part: PartRt, inst: DrumInst, vel: number, sr: number, seed: number) {
    this.part = part;
    this.inst = inst;
    this.note = inst.note;
    this.sr = sr;
    this.free = false;
    this.t = 0;
    this.fadeOut = 0;
    this.rng.s = (seed * 2654435761) >>> 0 || 7;
    const v01 = vel / 127;
    const s = inst.velSens / 127;
    this.vel = (1 - s + s * v01 * v01 * 1.15) * level(inst.level) * 0.9;
    const p = inst.pan / 64;
    this.gainL = panL(p);
    this.gainR = panR(p);
    this.revG = inst.rev / 127;
    this.dlyG = inst.dly / 127;
    this.drive = 1 + (inst.drive / 127) * 12;
    const ratio = Math.pow(2, inst.tune / 12);
    const decT = (lo: number, hi: number) => lo + (hi - lo) * Math.pow(inst.decay / 127, 2);
    const mul = (sec: number) => Math.exp(-1 / Math.max(1, sec * sr));
    const tone = inst.tone / 127;
    const snap = inst.snap / 127;
    this.ph.fill(0);
    this.env = this.env2 = this.envNoise = 1;
    this.f1.reset();
    this.f2.reset();
    this.bq.reset();
    this.bq2.reset();
    switch (inst.model) {
      case 'kick':
        this.freq = 48 * ratio;
        this.sweep = 1 + tone * 7; // multiplier at t=0
        this.sweepDec = mul(0.012 + (1 - snap) * 0.03);
        this.dec = mul(decT(0.08, 1.6));
        this.decN = mul(0.004);
        break;
      case 'tom':
      case 'conga':
        this.freq = (inst.model === 'tom' ? 110 : 220) * ratio;
        this.sweep = 1 + tone * 0.9;
        this.sweepDec = mul(0.05);
        this.dec = mul(decT(0.06, inst.model === 'tom' ? 0.9 : 0.4));
        this.decN = mul(0.01 + snap * 0.02);
        break;
      case 'snare':
        this.freq = 185 * ratio;
        this.sweep = 1.3;
        this.sweepDec = mul(0.02);
        this.dec = mul(decT(0.05, 0.25));
        this.decN = mul(decT(0.06, 0.6));
        this.f1.set(1200 + tone * 5000, 0.25, sr);
        break;
      case 'clap':
        this.decN = mul(decT(0.06, 0.8));
        this.bq.setBandpass(1100 * ratio + tone * 800, 1.4, sr);
        break;
      case 'hat':
      case 'cymbal': {
        const base = (inst.model === 'hat' ? 1.7 : 1.15) * ratio;
        this.freq = base;
        for (let i = 0; i < 6; i++) this.ph[i] = this.rng.uni();
        this.dec = mul(inst.model === 'hat' ? decT(0.025, 1.1) : decT(0.4, 4));
        this.bq.setBandpass((inst.model === 'hat' ? 9000 : 6500) * Math.min(1.6, ratio), 0.9, sr);
        this.bq2.setHighpass(4000 + tone * 6000, 0.7, sr);
        break;
      }
      case 'rim':
        this.freq = 1700 * ratio;
        this.dec = mul(decT(0.008, 0.06));
        this.bq.setBandpass(this.freq, 6, sr);
        break;
      case 'clave':
        this.freq = 2500 * ratio;
        this.dec = mul(decT(0.02, 0.12));
        break;
      case 'cowbell':
        this.freq = 540 * ratio;
        this.dec = mul(decT(0.05, 0.6));
        this.dec2 = mul(0.02);
        this.bq.setBandpass(2600 * ratio * (0.7 + tone * 0.6), 1.2, sr);
        break;
      case 'shaker':
        this.decN = mul(decT(0.03, 0.4));
        this.bq.setHighpass(4000 + tone * 6000, 0.8, sr);
        break;
      case 'zap':
        this.freq = 60 * ratio;
        this.sweep = 20 + tone * 60;
        this.sweepDec = mul(0.01 + snap * 0.08);
        this.dec = mul(decT(0.05, 0.6));
        break;
      case 'noise':
        this.decN = mul(decT(0.05, 3));
        this.sweep = tone;
        this.sweepDec = mul(0.05 + snap);
        break;
      case 'scratch':
        this.freq = 300 * ratio;
        this.dec = mul(decT(0.08, 0.6));
        break;
      case 'click':
        this.freq = 1500 * ratio;
        this.dec = mul(0.01);
        break;
      case 'tone': {
        const def = waveDef(inst.wave ?? 'sine');
        this.freq = 261.63 * ratio;
        this.osc.start(def, 64, sr, seed, this.freq);
        this.sweep = snap * 24; // semitone pitch drop
        this.sweepDec = mul(0.03);
        this.dec = mul(decT(0.05, 3));
        this.f1.set(200 + Math.pow(tone, 2) * 12000, 0.3, sr);
        break;
      }
    }
  }

  kill(ms = 6) {
    if (this.fadeOut > 0) return;
    this.fadeLen = this.fadeOut = Math.max(1, Math.round((ms / 1000) * this.sr));
  }

  render(offset: number, len: number): boolean {
    const part = this.part!;
    const inst = this.inst;
    const sr = this.sr;
    const L = part.l;
    const R = part.r;
    const tone = inst.tone / 127;
    const snap = inst.snap / 127;
    const spd = this.speed;
    for (let i = 0; i < len; i++) {
      let x = 0;
      const tt = this.t / sr;
      switch (inst.model) {
        case 'kick': {
          const f = this.freq * (1 + (this.sweep - 1) * this.env2) * spd;
          this.env2 *= this.sweepDec;
          this.ph[0] += f / sr;
          if (this.ph[0] >= 1) this.ph[0] -= 1;
          x = Math.sin(this.ph[0] * Math.PI * 2) * this.env;
          // click
          x += this.rng.next() * this.envNoise * snap * 0.6;
          this.envNoise *= this.decN;
          this.env *= this.dec;
          x = softClip(x * 1.3);
          break;
        }
        case 'tom':
        case 'conga': {
          const f = this.freq * (1 + (this.sweep - 1) * this.env2) * spd;
          this.env2 *= this.sweepDec;
          this.ph[0] += f / sr;
          if (this.ph[0] >= 1) this.ph[0] -= 1;
          x = Math.sin(this.ph[0] * Math.PI * 2) * this.env + this.rng.next() * this.envNoise * snap * 0.3;
          this.envNoise *= this.decN;
          this.env *= this.dec;
          break;
        }
        case 'snare': {
          const f = this.freq * (1 + (this.sweep - 1) * this.env2) * spd;
          this.env2 *= this.sweepDec;
          this.ph[0] += f / sr;
          this.ph[1] += (f * 1.78) / sr;
          const body = (Math.sin(this.ph[0] * Math.PI * 2) + 0.6 * Math.sin(this.ph[1] * Math.PI * 2)) * this.env;
          this.f1.tick(this.rng.next());
          const nz = (this.f1.bp * 1.2 + this.f1.hp * 0.5) * this.envNoise;
          x = body * (1 - snap * 0.6) * 0.7 + nz * (0.3 + snap * 0.9);
          this.env *= this.dec;
          this.envNoise *= this.decN;
          break;
        }
        case 'clap': {
          // three quick bursts then a tail
          const ms = tt * 1000;
          let e = 0;
          if (ms < 30) {
            const k = ms % 10;
            e = Math.exp(-k / 2.2);
          } else {
            e = this.envNoise;
            this.envNoise *= this.decN;
          }
          x = this.bq.tick(this.rng.next()) * e * 2.2;
          break;
        }
        case 'hat':
        case 'cymbal': {
          let sq = 0;
          for (let k = 0; k < 6; k++) {
            this.ph[k] += (HAT_FREQS[k] * this.freq * spd) / sr;
            if (this.ph[k] >= 1) this.ph[k] -= 1;
            sq += this.ph[k] < 0.5 ? 1 : -1;
          }
          const metal = sq / 6;
          const nz = this.rng.next();
          const src = metal * (1 - snap * 0.7) + nz * snap * 0.7;
          x = this.bq2.tick(this.bq.tick(src)) * this.env * 2.4;
          this.env *= this.dec;
          break;
        }
        case 'rim': {
          const click = this.t < 3 ? 1 : 0;
          x = this.bq.tick(click * 8 + this.rng.next() * 0.05) * this.env;
          this.ph[0] += (500 * spd) / sr;
          x += Math.sin(this.ph[0] * Math.PI * 2) * this.env * 0.3;
          this.env *= this.dec;
          break;
        }
        case 'clave': {
          this.ph[0] += (this.freq * spd) / sr;
          x = Math.sin(this.ph[0] * Math.PI * 2) * this.env;
          this.env *= this.dec;
          break;
        }
        case 'cowbell': {
          this.ph[0] += (this.freq * spd) / sr;
          this.ph[1] += (this.freq * 1.48 * spd) / sr;
          if (this.ph[0] >= 1) this.ph[0] -= 1;
          if (this.ph[1] >= 1) this.ph[1] -= 1;
          const sq = (this.ph[0] < 0.5 ? 1 : -1) + (this.ph[1] < 0.5 ? 1 : -1);
          const e = this.env * 0.7 + this.env2 * 0.6;
          x = this.bq.tick(sq * 0.5) * e * 1.6;
          this.env *= this.dec;
          this.env2 *= this.dec2;
          break;
        }
        case 'shaker': {
          const atk = Math.min(1, tt / 0.012);
          x = this.bq.tick(this.rng.next()) * this.envNoise * atk;
          this.envNoise *= this.decN;
          break;
        }
        case 'zap': {
          const f = this.freq * (1 + this.sweep * this.env2) * spd;
          this.env2 *= this.sweepDec;
          this.ph[0] += f / sr;
          if (this.ph[0] >= 1) this.ph[0] -= 1;
          x = Math.sin(this.ph[0] * Math.PI * 2) * this.env;
          this.env *= this.dec;
          break;
        }
        case 'noise': {
          if ((this.t & 15) === 0) {
            const c = 200 + 14000 * clamp(this.sweep * this.env2 + (1 - this.sweep) * (1 - this.env2) * 0.3 + 0.05, 0, 1);
            this.f1.set(c, 0.4 + snap * 0.5, sr);
          }
          this.env2 *= Math.pow(this.sweepDec, 1);
          x = this.f1.tick(this.rng.next()) * this.envNoise;
          this.envNoise *= this.decN;
          break;
        }
        case 'scratch': {
          // back-and-forth record motion
          const motion = Math.sin(tt * Math.PI * 2 * (6 + tone * 10));
          const f = this.freq * (1 + motion * 0.8) * spd;
          this.ph[0] += f / sr;
          if (this.ph[0] >= 1) this.ph[0] -= 1;
          const saw = this.ph[0] * 2 - 1;
          if ((this.t & 15) === 0) this.f1.set(900 + Math.abs(motion) * 2500, 0.6, sr);
          x = (this.f1.tick(saw + this.rng.next() * 0.3) * 1.5) * this.env * Math.abs(motion);
          this.env *= this.dec;
          break;
        }
        case 'click': {
          this.ph[0] += (this.freq * spd) / sr;
          x = Math.sin(this.ph[0] * Math.PI * 2) * this.env;
          this.env *= this.dec;
          break;
        }
        case 'tone': {
          const f = this.freq * Math.pow(2, (this.sweep * this.env2) / 12) * spd;
          this.env2 *= this.sweepDec;
          const o = this.osc.next(f / sr, 0);
          x = this.f1.tick(o) * this.env;
          this.env *= this.dec;
          break;
        }
      }
      if (this.drive > 1.01) x = softClip(x * this.drive) / Math.sqrt(this.drive) * 1.3;
      let g = this.vel;
      if (this.fadeOut > 0) {
        g *= this.fadeOut / this.fadeLen;
        if (--this.fadeOut === 0) {
          this.free = true;
          return false;
        }
      }
      const v = x * g;
      const l = v * this.gainL;
      const r = v * this.gainR;
      L[offset + i] += l;
      R[offset + i] += r;
      if (this.revG) {
        part.revL[offset + i] += l * this.revG;
        part.revR[offset + i] += r * this.revG;
      }
      if (this.dlyG) {
        part.dlyL[offset + i] += l * this.dlyG;
        part.dlyR[offset + i] += r * this.dlyG;
      }
      this.t++;
    }
    // finished when the amplitude envelopes have decayed
    let e = this.env;
    switch (inst.model) {
      case 'tom': case 'conga': case 'snare': e = Math.max(this.env, this.envNoise); break;
      case 'clap': case 'shaker': case 'noise': e = this.envNoise; break;
      case 'cowbell': e = Math.max(this.env, this.env2); break;
    }
    const minT = inst.model === 'clap' ? 0.04 * sr : 0;
    if (this.t > minT && e < 0.0005) {
      this.free = true;
      return false;
    }
    if (this.t > sr * 12) {
      this.free = true;
      return false;
    }
    return true;
  }
}
