import type { Patch, PartSetup, Tone } from '../../model/types';
import { Env, envTimes, LfoState } from './env';
import { Tvf } from './filter';
import { clamp, cutoffHz, level, mtof, panL, panR, Rng } from './math';
import { Osc } from './osc';
import { waveDef } from './waves';

export const CR = 16; // control-rate interval in samples

/** Live state for one part, shared by its voices. */
export interface PartRt {
  index: number;
  setup: PartSetup;
  bend: number; // -1..1
  mod: number; // 0..1 (CC1)
  expr: number; // 0..1 (CC11)
  hold: boolean; // CC64
  dbeamCutoff: number; // extra cutoff units from D-Beam
  dbeamRes: number;
  dbeamPitch: number; // semitones
  dbeamLfo: number;
  l: Float32Array;
  r: Float32Array;
  revL: Float32Array; // per-part direct send buses (rhythm instruments)
  revR: Float32Array;
  dlyL: Float32Array;
  dlyR: Float32Array;
  lastPitch: number; // for portamento
  heldStack: number[]; // mono mode note priority
  sustained: Set<number>;
  peak: number;
}

const velScale = (sens: number, v01: number) => {
  const s = Math.abs(sens) / 63;
  return 1 - s + s * (sens >= 0 ? v01 : 1 - v01);
};

class ToneVoice {
  osc = new Osc();
  tvf = new Tvf();
  aenv = new Env();
  penv = new Env();
  fenv = new Env();
  lfo1 = new LfoState();
  lfo2 = new LfoState();
  active = false; // tone contributes audio
  oscOn = false; // oscillator runs (also for ring/fxm partner)
  randCents = 0;
  velGain = 1;
  penvDepth = 0;
  fenvDepth = 0;
  // control-rate outputs
  dt = 0;
  amp = 0;
  ampTarget = 0;
  pan = 0;
  drive = 1;
}

export class Voice {
  part: PartRt | null = null;
  patch!: Patch;
  note = 60;
  pitchNote = 60; // note after key shift / octave
  vel = 100;
  released = false;
  sustainHeld = false; // released while sustain pedal held
  age = 0;
  free = true;
  t = [new ToneVoice(), new ToneVoice()];
  sr = 48000;
  ctr = 0;
  glide = 0; // current glide pitch offset (semitones), decays toward 0
  glideCoef = 1;
  drift = 0;
  driftTarget = 0;
  rng = new Rng(5);
  structure: Patch['structure'] = 'mix';
  bpm = 120;
  speed = 1;
  fadeOut = 0; // >0 when being stolen/choked: samples remaining
  fadeLen = 0;

  start(part: PartRt, note: number, vel: number, sr: number, seed: number, globalTime: number, glideFrom: number | null, bpm: number) {
    this.part = part;
    this.patch = part.setup.patch;
    const patch = this.patch;
    this.note = note;
    this.vel = vel;
    this.sr = sr;
    this.free = false;
    this.released = false;
    this.sustainHeld = false;
    this.age = 0;
    this.ctr = 0;
    this.fadeOut = 0;
    this.bpm = bpm;
    this.structure = patch.structure;
    this.rng.s = (seed * 747796405 + 1) >>> 0 || 1;
    this.pitchNote = note + part.setup.key + patch.octave * 12;
    this.drift = 0;
    this.driftTarget = 0;
    if (glideFrom !== null && patch.portamento) {
      this.glide = glideFrom - this.pitchNote;
      const tsec = 0.002 + Math.pow(patch.portaTime / 127, 2) * 3;
      this.glideCoef = 1 - Math.exp(-CR / (tsec * 0.33 * sr));
    } else this.glide = 0;
    const rt = part.setup.rt;
    const atk = Math.pow(2, (rt.attack / 63) * 3);
    const dec = Math.pow(2, (rt.decay / 63) * 3);
    const rel = Math.pow(2, (rt.release / 63) * 3);
    const v01 = vel / 127;
    const special = patch.structure !== 'mix';
    for (let i = 0; i < 2; i++) {
      const tone = patch.tones[i];
      const tv = this.t[i];
      const used = special ? (i === 0 ? true : patch.structure === 'ring+2' ? tone.on : false) : tone.on;
      tv.active = used;
      tv.oscOn = used || (special && i === 1);
      if (!tv.oscOn) continue;
      const def = waveDef(tone.wave);
      const f = mtof(this.pitchOf(tone, 0));
      tv.osc.start(def, tone.waveParam, sr, seed * 3 + i, f);
      tv.tvf.reset();
      tv.randCents = tone.randomPitch ? this.rng.next() * tone.randomPitch : 0;
      tv.velGain = 1 - tone.velSens / 127 + (tone.velSens / 127) * v01 * v01 * 1.2;
      tv.penvDepth = tone.penvDepth * velScale(tone.penvVelSens, v01);
      tv.fenvDepth = (tone.fenvDepth + rt.envDepth) * velScale(tone.fenvVelSens, v01);
      const a = tone.aenv;
      tv.aenv.start(sr, envTimes(a.t1, a.t2, a.t3, a.t4, atk, dec, rel), [0, a.l1 / 127, a.l2 / 127, a.l3 / 127, 0]);
      const p = tone.penv;
      tv.penv.start(sr, envTimes(p.t1, p.t2, p.t3, p.t4), [p.l0 / 63, p.l1 / 63, p.l2 / 63, p.l3 / 63, p.l4 / 63]);
      const fe = tone.fenv;
      tv.fenv.start(sr, envTimes(fe.t1, fe.t2, fe.t3, fe.t4, atk, dec, rel), [fe.l0 / 127, fe.l1 / 127, fe.l2 / 127, fe.l3 / 127, fe.l4 / 127]);
      tv.lfo1.start(tone.lfo1, globalTime, seed * 7 + i);
      tv.lfo2.start(tone.lfo2, globalTime, seed * 11 + i);
      tv.amp = 0;
      tv.ampTarget = 0;
    }
  }

  /** Legato: change pitch without re-triggering envelopes. */
  legatoTo(note: number) {
    const part = this.part!;
    const prev = this.pitchNote + this.glide;
    this.note = note;
    this.pitchNote = note + part.setup.key + this.patch.octave * 12;
    if (this.patch.portamento) {
      this.glide = prev - this.pitchNote;
      const tsec = 0.002 + Math.pow(this.patch.portaTime / 127, 2) * 3;
      this.glideCoef = 1 - Math.exp(-CR / (tsec * 0.33 * this.sr));
    } else this.glide = 0;
  }

  retrigger(note: number, vel: number) {
    this.legatoTo(note);
    this.vel = vel;
    this.released = false;
    for (const tv of this.t) {
      if (!tv.oscOn) continue;
      tv.aenv.retrigger();
      tv.fenv.retrigger();
      tv.penv.retrigger();
    }
  }

  release() {
    if (this.released) return;
    this.released = true;
    for (const tv of this.t) {
      if (!tv.oscOn) continue;
      tv.aenv.release();
      tv.penv.release();
      tv.fenv.release();
    }
  }

  /** Fast fade (voice steal / choke). */
  kill(ms = 4) {
    this.fadeLen = this.fadeOut = Math.max(1, Math.round((ms / 1000) * this.sr));
    this.released = true;
  }

  get currentPitch() {
    return this.pitchNote + this.glide;
  }

  private pitchOf(tone: Tone, extraSemis: number) {
    const base = 60 + ((this.pitchNote + this.glide - 60) * tone.pitchKeyFollow) / 100;
    return base + tone.coarse + tone.fine / 100 + extraSemis;
  }

  private control() {
    const part = this.part!;
    const patch = part.setup.patch;
    const rt = part.setup.rt;
    const sr = this.sr;
    const dtSec = CR / sr;
    if (this.glide !== 0) {
      this.glide -= this.glide * this.glideCoef;
      if (Math.abs(this.glide) < 0.001) this.glide = 0;
    }
    if (patch.analogFeel) {
      if (this.rng.uni() < 0.01) this.driftTarget = this.rng.next();
      this.drift += (this.driftTarget - this.drift) * 0.01;
    }
    const common =
      part.bend * patch.bendRange + rt.pitch / 100 + part.dbeamPitch + this.drift * (patch.analogFeel / 127) * 0.25 +
      12 * Math.log2(this.speed);
    const lfoDepthAdd = rt.lfoDepth + part.dbeamLfo;
    for (let i = 0; i < 2; i++) {
      const tv = this.t[i];
      if (!tv.oscOn) continue;
      const tone = patch.tones[i];
      const l1 = tv.lfo1.tick(tone.lfo1, dtSec, this.bpm, rt.lfoRate);
      const l2 = tv.lfo2.tick(tone.lfo2, dtSec, this.bpm, 0);
      const pe = tv.penv.tick(CR);
      const fe = tv.fenv.tick(CR);
      // pitch
      const lfoP1 = tone.lfo1.pitch + part.mod * 30 + lfoDepthAdd * 0.25;
      const pitchMod =
        (Math.sign(lfoP1) * (lfoP1 / 63) ** 2 * 12 * l1) +
        (Math.sign(tone.lfo2.pitch) * (tone.lfo2.pitch / 63) ** 2 * 12 * l2);
      const semis = this.pitchOf(tone, common + tv.randCents / 100 + pe * tv.penvDepth + pitchMod);
      const f = mtof(semis);
      tv.dt = f / sr;
      tv.osc.setFreq(f);
      // filter
      const kf = (tone.cutoffKeyFollow / 100) * (this.pitchNote - 60) * (127 / 120);
      const units =
        tone.cutoff + rt.cutoff + part.dbeamCutoff + kf + fe * tv.fenvDepth * 2 +
        l1 * (tone.lfo1.filter + lfoDepthAdd * 0.6) + l2 * tone.lfo2.filter;
      const res = clamp((tone.resonance + rt.resonance + part.dbeamRes) / 127, 0, 1);
      tv.tvf.set(tone.filterType, clamp(cutoffHz(units), 20, 22000), res, sr);
      // amp
      const am1 = tone.lfo1.amp ? 1 - (Math.abs(tone.lfo1.amp) / 63) * 0.5 * (1 - Math.sign(tone.lfo1.amp) * l1) : 1;
      const am2 = tone.lfo2.amp ? 1 - (Math.abs(tone.lfo2.amp) / 63) * 0.5 * (1 - Math.sign(tone.lfo2.amp) * l2) : 1;
      tv.ampTarget = tv.velGain * level(tone.level) * am1 * am2;
      tv.pan = clamp(tone.pan / 64 + patch.pan / 64 + (l1 * tone.lfo1.pan + l2 * tone.lfo2.pan) / 63, -1, 1);
      tv.drive = 1 + (tone.drive / 127) * 10;
    }
  }

  /** Render into the part bus. Returns false when the voice has finished. */
  render(offset: number, len: number): boolean {
    const part = this.part!;
    const L = part.l;
    const R = part.r;
    const t0 = this.t[0];
    const t1 = this.t[1];
    const st = this.structure;
    const patch = part.setup.patch;
    const depth = patch.structureDepth / 127;
    const gain = 0.28 * level(patch.level);
    for (let i = 0; i < len; i++) {
      if (this.ctr === 0) this.control();
      this.ctr = (this.ctr + 1) % CR;
      let fade = 1;
      if (this.fadeOut > 0) {
        fade = this.fadeOut / this.fadeLen;
        if (--this.fadeOut === 0) {
          this.free = true;
          return false;
        }
      }
      let o2 = 0;
      if (t1.oscOn) o2 = t1.osc.next(t1.dt, 0);
      let o1 = 0;
      if (t0.oscOn) {
        if (st === 'fxm') o1 = t0.osc.next(t0.dt, o2 * depth * 0.8);
        else {
          if (st === 'sync' && t1.osc.wrapped) t0.osc.phase = 0;
          o1 = t0.osc.next(t0.dt, 0);
        }
      }
      let sL = 0;
      let sR = 0;
      if (t0.active) {
        let x = st === 'ring' || st === 'ring+2' ? o1 * o2 * (0.5 + depth) : o1;
        if (t0.drive > 1.001) x = Math.tanh(x * t0.drive) / Math.sqrt(t0.drive) * 1.4;
        const y = t0.tvf.process(x);
        const a = t0.aenv.tick(1) * t0.ampTarget;
        const v = y * a;
        sL += v * panL(t0.pan);
        sR += v * panR(t0.pan);
      }
      if (t1.active) {
        let x = o2;
        if (t1.drive > 1.001) x = Math.tanh(x * t1.drive) / Math.sqrt(t1.drive) * 1.4;
        const y = t1.tvf.process(x);
        const a = t1.aenv.tick(1) * t1.ampTarget;
        const v = y * a;
        sL += v * panL(t1.pan);
        sR += v * panR(t1.pan);
      }
      const g = gain * fade;
      L[offset + i] += sL * g;
      R[offset + i] += sR * g;
    }
    this.age += len;
    // finished?
    let alive = false;
    for (const tv of this.t) {
      if (!tv.active) continue;
      const e = tv.aenv;
      if (!(e.done || (e.stage === 4 && e.levels[3] <= 0.0005))) alive = true;
    }
    if (!alive) {
      this.free = true;
      return false;
    }
    return true;
  }
}
