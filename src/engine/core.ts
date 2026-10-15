// The FiveOhFive engine: voices, rhythm part, sequencer, arpeggiator, RPS, Megamix,
// effects and mixer, all rendered sample-accurately on the audio thread.
// This module has no Web Audio dependencies so it also runs under Node for tests.

import type {
  ArpSettings, DBeamTarget, DrumInst, FxSetup, Kit, MuteEv, PartSetup, Pattern, SeqEv, SystemSettings,
} from '../model/types';
import { NUM_PARTS, PPQN } from '../model/types';
import { clone, defaultArp, defaultFx, defaultSystem, emptyPattern, measureTicks, patternTicks } from '../model/defaults';
import { ARP_MAP, ARP_RATE_TICKS, ArpStep, BEAT_MAP } from '../presets/arp';
import { grooveAt } from '../presets/grooves';
import { EFX_MAP } from '../model/efxDefs';
import { DrumVoice } from './dsp/drum';
import { Biquad, Svf } from './dsp/filter';
import { Efx, Reverb, StereoDelay } from './dsp/fx';
import { clamp, level } from './dsp/math';
import { PartRt, Voice } from './dsp/voice';
import type { FromEngine, RpsPhrase, ToEngine } from './messages';

const BLOCK = 128;
const MAX_VOICES = 64;
const MAX_DRUMS = 40;

interface PlayEv { pt: number; ev: SeqEv; vel: number }
interface Pending { at: number; part: number; note: number; src: number }
interface ActivePhrase { slot: number; start: number; idx: number; phrase: RpsPhrase; stopping: boolean; notes: Set<number> }

const SRC_SEQ = 0;
const SRC_ARP = 1;
const SRC_RPS = 2; // + slot

export class Engine {
  sr: number;
  frame = 0;
  outbox: FromEngine[] = [];
  parts: PartRt[] = [];
  voices: Voice[] = [];
  drums: DrumVoice[] = [];
  drumMap: (DrumInst | null)[] = new Array(128).fill(null);
  kit: Kit | null = null;
  reverb: Reverb;
  delay: StereoDelay;
  efx: Efx;
  fx: FxSetup = defaultFx();
  efxCtrl: [number | null, number | null] = [null, null];
  sys: SystemSettings = defaultSystem();
  lowShelf = [new Biquad(), new Biquad()];
  rhythmFilt = [new Svf(), new Svf()];
  // buses
  dryL = new Float32Array(BLOCK);
  dryR = new Float32Array(BLOCK);
  efxL = new Float32Array(BLOCK);
  efxR = new Float32Array(BLOCK);
  efxOutL = new Float32Array(BLOCK);
  efxOutR = new Float32Array(BLOCK);
  revL = new Float32Array(BLOCK);
  revR = new Float32Array(BLOCK);
  dlyL = new Float32Array(BLOCK);
  dlyR = new Float32Array(BLOCK);
  // sequencer
  pattern: Pattern = emptyPattern('INIT');
  queued: Pattern | null = null;
  play: PlayEv[][] = [];
  playIdx: number[] = new Array(NUM_PARTS).fill(0);
  mutePlay: MuteEv[] = [];
  muteIdx = 0;
  lengthTicks = 768;
  barTicks = 384;
  tempo = 120;
  clk = 0; // free running clock, ticks
  ptick = 0; // pattern position, ticks
  playing = false;
  startPending = false;
  countIn = false;
  recording = false;
  recPart = 1;
  recHeld = new Map<string, { t: number; v: number }>();
  pending: Pending[] = [];
  // turntable
  speed = 1;
  stopping = false;
  // arpeggiator
  arp: ArpSettings = defaultArp();
  arpPart = 1;
  arpHeld: number[] = []; // in press order
  arpLatched: number[] = [];
  arpVel = 100;
  arpSteps: ArpStep[] = [];
  arpPos = 0;
  arpClock = 0; // step counter
  arpNextTick = -1;
  // RPS
  rpsPhrases: (RpsPhrase | null)[] = [];
  rpsQuant: 'off' | '1/16' | 'beat' | 'measure' = 'beat';
  rpsHold = false;
  rpsActive: ActivePhrase[] = [];
  // megamix
  mega: ({ events: PlayEv[]; length: number; idx: number } | null)[] = new Array(NUM_PARTS).fill(null);
  megaPending: { part: number; events: SeqEv[] | null; length: number }[] = [];
  // performance
  focus = 1;
  dbeam: number | null = null;
  // metronome
  clickPh = 0;
  clickEnv = 0;
  clickFreq = 1000;
  // reporting
  reportCtr = 0;
  hits = new Array(NUM_PARTS).fill(0);
  drumHits: number[] = [];
  peaks = new Array(NUM_PARTS).fill(0);
  masterPeak: [number, number] = [0, 0];
  midiOut: [number, number[]][] = [];
  seed = 1;
  time = 0;

  constructor(sr: number) {
    this.sr = sr;
    for (let i = 0; i < NUM_PARTS; i++) {
      this.parts.push({
        index: i,
        setup: this.pattern.parts[i],
        bend: 0, mod: 0, expr: 1, hold: false,
        dbeamCutoff: 0, dbeamRes: 0, dbeamPitch: 0, dbeamLfo: 0,
        l: new Float32Array(BLOCK), r: new Float32Array(BLOCK),
        revL: new Float32Array(BLOCK), revR: new Float32Array(BLOCK),
        dlyL: new Float32Array(BLOCK), dlyR: new Float32Array(BLOCK),
        lastPitch: 60, heldStack: [], sustained: new Set(), peak: 0,
      });
    }
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice());
    for (let i = 0; i < MAX_DRUMS; i++) this.drums.push(new DrumVoice());
    this.reverb = new Reverb(sr);
    this.delay = new StereoDelay(sr);
    this.efx = new Efx(sr);
    this.applyFx(this.fx);
    this.applySystem(this.sys);
    this.loadPattern(this.pattern);
  }

  // ------------------------------------------------------------ messages

  handle(m: ToEngine) {
    switch (m.type) {
      case 'pattern':
        if (m.mode === 'queue' && this.playing) this.queued = m.pattern;
        else this.loadPattern(m.pattern);
        break;
      case 'tracks':
        this.pattern.tracks = m.tracks;
        this.pattern.muteTrack = m.muteTrack;
        this.buildPlay();
        this.seekIdx(Math.max(0, Math.round(this.ptick)) + 1);
        break;
      case 'part':
        this.setPart(m.index, m.setup);
        break;
      case 'kit':
        this.setKit(m.kit);
        break;
      case 'fx':
        this.applyFx(m.fx);
        break;
      case 'groove':
        this.pattern.groove = m.groove;
        this.buildPlay();
        this.seekIdx(Math.max(0, Math.round(this.ptick)) + 1);
        break;
      case 'tempo':
        this.tempo = clamp(m.bpm, 20, 300);
        this.pattern.tempo = this.tempo;
        break;
      case 'length':
        this.pattern.measures = m.measures;
        this.pattern.beat = m.beat;
        this.lengthTicks = patternTicks(this.pattern);
        this.barTicks = measureTicks(this.pattern);
        this.buildPlay();
        break;
      case 'play':
        if (this.playing && !this.stopping) break;
        this.stopping = false;
        this.speed = 1;
        this.startPending = true;
        this.countIn = m.countIn;
        break;
      case 'stop':
        if (!this.playing) {
          this.startPending = false;
          this.allNotesOff(false);
          break;
        }
        if (m.turntable) this.stopping = true;
        else this.doStop();
        break;
      case 'rec':
        this.recording = m.on;
        this.recPart = m.part;
        if (!m.on) this.flushRecHeld();
        break;
      case 'note':
        this.liveNote(m.part, m.note, m.vel, m.record !== false);
        break;
      case 'cc':
        this.applyCc(m.part, m.cc, m.value);
        if (m.record !== false) this.recordEv(m.part, { t: 0, k: 'c', c: m.cc, v: m.value });
        break;
      case 'bend':
        this.parts[m.part].bend = clamp(m.value / 8192, -1, 1);
        if (m.record !== false) this.recordEv(m.part, { t: 0, k: 'b', v: m.value });
        break;
      case 'arp': {
        const was = this.arp.on;
        this.arp = m.settings;
        if (this.arpPart !== m.part) {
          this.arpHeld = [];
          this.arpLatched = [];
        }
        this.arpPart = m.part;
        if (!m.settings.hold) this.arpLatched = [];
        if (was && !m.settings.on) {
          this.arpHeld = [];
          this.arpLatched = [];
          this.releaseSrc(SRC_ARP);
        }
        this.rebuildArp();
        break;
      }
      case 'rps':
        this.rpsPhrases = m.phrases;
        this.rpsQuant = m.set.quantize;
        this.rpsHold = m.set.hold;
        break;
      case 'rpsPad':
        this.rpsPad(m.slot, m.on);
        break;
      case 'megamix':
        this.megaPending.push({ part: m.part, events: m.events, length: m.length });
        if (!this.playing) this.applyMegaPending();
        break;
      case 'system':
        this.applySystem(m.sys);
        break;
      case 'focus':
        this.focus = m.part;
        this.applyDbeam();
        break;
      case 'dbeam':
        this.dbeam = m.value;
        this.applyDbeam();
        break;
      case 'efxCtrl':
        this.efxCtrl[m.ctrl] = m.value;
        this.applyFx(this.fx);
        break;
      case 'panic':
        this.allNotesOff(true);
        this.pending = [];
        this.rpsActive = [];
        this.arpHeld = [];
        this.arpLatched = [];
        break;
    }
  }

  private post(m: FromEngine) {
    this.outbox.push(m);
  }

  drain() {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  // ------------------------------------------------------------ pattern

  loadPattern(p: Pattern) {
    this.pattern = p;
    this.tempo = p.tempo;
    this.lengthTicks = patternTicks(p);
    this.barTicks = measureTicks(p);
    for (let i = 0; i < NUM_PARTS; i++) this.setPart(i, p.parts[i]);
    this.setKit(p.kit);
    this.applyFx(p.fx);
    this.mega.fill(null);
    this.buildPlay();
    if (this.ptick >= this.lengthTicks) this.ptick = this.ptick % this.lengthTicks;
    this.seekIdx(Math.max(0, Math.round(this.ptick)) + (this.playing ? 1 : 0));
  }

  private setPart(i: number, setup: PartSetup) {
    const part = this.parts[i];
    const wasMuted = part.setup.mute;
    part.setup = setup;
    if (setup.mute && !wasMuted) this.releasePart(i);
  }

  private setKit(kit: Kit) {
    this.kit = kit;
    this.drumMap.fill(null);
    for (const d of kit.insts) if (d.note >= 0 && d.note < 128) this.drumMap[d.note] = d;
  }

  private applyFx(fx: FxSetup) {
    this.fx = fx;
    let efx = fx.efx;
    if (this.efxCtrl[0] !== null || this.efxCtrl[1] !== null) {
      const def = EFX_MAP[efx.type];
      const params = { ...efx.params };
      [0, 1].forEach((c) => {
        const v = this.efxCtrl[c as 0 | 1];
        if (v === null || !def) return;
        const pd = def.params.find((q) => q.key === def.ctrl[c]);
        if (pd) params[pd.key] = Math.round(pd.min + (pd.max - pd.min) * clamp(v, 0, 1));
      });
      efx = { ...efx, params };
    }
    this.efx.set(efx);
    this.reverb.set(fx.reverb);
    this.delay.set(fx.delay);
  }

  private applySystem(sys: SystemSettings) {
    this.sys = sys;
    for (const b of this.lowShelf) b.setLowShelf(sys.lowBoost.freq, sys.lowBoost.on ? sys.lowBoost.gain : 0, this.sr);
  }

  /** Pre-compute playback order with groove applied. */
  private buildPlay() {
    const p = this.pattern;
    const len = this.lengthTicks;
    this.play = [];
    for (let i = 0; i < NUM_PARTS; i++) {
      const tr = p.tracks[i] ?? [];
      const arr: PlayEv[] = [];
      for (const ev of tr) {
        if (ev.t < 0 || ev.t >= len) continue;
        let pt = ev.t;
        let vel = 1;
        if (ev.k === 'n' && p.groove.type !== 'off') {
          const [off, vf] = grooveAt(p.groove, ev.t);
          pt = clamp(ev.t + off, 0, len - 1);
          vel = vf;
        }
        arr.push({ pt: Math.round(pt), ev, vel });
      }
      arr.sort((a, b) => a.pt - b.pt);
      this.play.push(arr);
    }
    this.mutePlay = [...(p.muteTrack ?? [])].sort((a, b) => a.t - b.t);
  }

  /** Point track cursors at the first event at or after tick t. */
  private seekIdx(t: number) {
    for (let i = 0; i < NUM_PARTS; i++) {
      const arr = this.play[i];
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].pt < t) lo = mid + 1;
        else hi = mid;
      }
      this.playIdx[i] = lo;
    }
    let k = 0;
    while (k < this.mutePlay.length && this.mutePlay[k].t < t) k++;
    this.muteIdx = k;
    for (const m of this.mega) {
      if (!m) continue;
      const lt = t % m.length;
      let j = 0;
      while (j < m.events.length && m.events[j].pt < lt) j++;
      m.idx = j;
    }
  }

  private doStop() {
    this.playing = false;
    this.startPending = false;
    this.stopping = false;
    this.speed = 1;
    this.flushRecHeld();
    this.releaseSrc(SRC_SEQ);
    this.releaseSrc(SRC_ARP);
    for (const pr of this.parts) {
      pr.bend = 0;
    }
    this.ptick = 0;
    this.seekIdx(0);
    if (this.sys.midi.clockOut) this.midiOut.push([0, [0xfc]]);
    this.post({ type: 'stopped' });
  }

  // ------------------------------------------------------------ voices

  private allocVoice(): Voice {
    let best: Voice | null = null;
    for (const v of this.voices) if (v.free) return v;
    // steal: oldest released first, then oldest
    for (const v of this.voices) if (v.released && v.fadeOut === 0 && (!best || v.age > best.age)) best = v;
    if (!best) for (const v of this.voices) if (v.fadeOut === 0 && (!best || v.age > best.age)) best = v;
    if (!best) best = this.voices[0];
    // hard steal: the voice is reused immediately
    best.free = true;
    return best;
  }

  noteOn(pi: number, note: number, vel: number, src: number) {
    if (vel <= 0) return this.noteOff(pi, note);
    const part = this.parts[pi];
    this.hits[pi]++;
    this.seed = (this.seed + 1) >>> 0;
    if (pi === 0) {
      const inst = this.drumMap[note];
      if (!inst) return;
      this.drumHits.push(note);
      for (const d of this.drums) {
        if (d.free) continue;
        if (d.note === note || (inst.choke && d.inst.choke === inst.choke)) d.kill(d.note === note ? 3 : 8);
      }
      let dv: DrumVoice | null = null;
      for (const d of this.drums) if (d.free) { dv = d; break; }
      if (!dv) {
        let oldest = this.drums[0];
        for (const d of this.drums) if (d.t > oldest.t) oldest = d;
        dv = oldest;
      }
      dv.start(part, inst, vel, this.sr, this.seed);
      dv.speed = this.speed;
      this.midiNote(pi, note, vel, src);
      return;
    }
    const patch = part.setup.patch;
    if (!patch) return;
    this.midiNote(pi, note, vel, src);
    if (patch.mono) {
      const stack = part.heldStack;
      const k = stack.indexOf(note);
      if (k >= 0) stack.splice(k, 1);
      stack.push(note);
      let mv: Voice | null = null;
      for (const v of this.voices) if (!v.free && v.part === part && v.fadeOut === 0) { mv = v; break; }
      if (mv) {
        const legato = patch.legato && !mv.released && stack.length > 1;
        if (legato) mv.legatoTo(note);
        else mv.retrigger(note, vel);
        part.lastPitch = mv.pitchNote;
        return;
      }
      const v = this.allocVoice();
      v.start(part, note, vel, this.sr, this.seed, this.time, patch.portamento ? part.lastPitch : null, this.tempo);
      v.speed = this.speed;
      part.lastPitch = v.pitchNote;
      return;
    }
    // poly: retrigger the same note on the same part by releasing the old one
    for (const v of this.voices) if (!v.free && v.part === part && v.note === note && !v.released) v.release();
    const v = this.allocVoice();
    v.start(part, note, vel, this.sr, this.seed, this.time, patch.portamento ? part.lastPitch : null, this.tempo);
    v.speed = this.speed;
    part.lastPitch = v.pitchNote;
  }

  noteOff(pi: number, note: number, src = -1) {
    const part = this.parts[pi];
    this.midiNote(pi, note, 0, src);
    if (pi === 0) return;
    const patch = part.setup.patch;
    if (patch?.mono) {
      const stack = part.heldStack;
      const k = stack.indexOf(note);
      if (k >= 0) stack.splice(k, 1);
      for (const v of this.voices) {
        if (v.free || v.part !== part || v.released) continue;
        if (v.note !== note) continue;
        if (stack.length) v.legatoTo(stack[stack.length - 1]);
        else if (part.hold) part.sustained.add(note);
        else v.release();
      }
      return;
    }
    for (const v of this.voices) {
      if (v.free || v.part !== part || v.note !== note || v.released) continue;
      if (part.hold) part.sustained.add(note);
      else v.release();
    }
  }

  private releasePart(pi: number) {
    const part = this.parts[pi];
    for (const v of this.voices) if (!v.free && v.part === part) v.release();
    part.heldStack = [];
    this.pending = this.pending.filter((p) => p.part !== pi);
  }

  allNotesOff(hard: boolean) {
    for (const v of this.voices) if (!v.free) (hard ? v.kill(5) : v.release());
    if (hard) for (const d of this.drums) if (!d.free) d.kill(5);
    for (const p of this.parts) {
      p.heldStack = [];
      p.sustained.clear();
      p.hold = false;
    }
    this.pending = [];
  }

  private releaseSrc(src: number) {
    const keep: Pending[] = [];
    for (const p of this.pending) {
      if (p.src !== src) keep.push(p);
      else if (p.note < 0) this.arpInput(-p.note - 1, 0);
      else this.noteOff(p.part, p.note, p.src);
    }
    this.pending = keep;
  }

  private midiNote(pi: number, note: number, vel: number, src: number) {
    if (!this.sys.midi.seqOut || src < 0) return;
    const ch = (this.parts[pi].setup.midiCh - 1) & 15;
    this.midiOut.push([this.renderOffset, vel > 0 ? [0x90 | ch, note & 127, vel & 127] : [0x80 | ch, note & 127, 0]]);
  }
  renderOffset = 0;

  private applyCc(pi: number, cc: number, v: number) {
    const part = this.parts[pi];
    const s = part.setup;
    const rtv = v - 64;
    switch (cc) {
      case 1: part.mod = v / 127; break;
      case 7: s.level = v; break;
      case 10: s.pan = v - 64; break;
      case 11: part.expr = v / 127; break;
      case 64:
        part.hold = v >= 64;
        if (!part.hold) {
          for (const n of part.sustained) for (const vc of this.voices) if (!vc.free && vc.part === part && vc.note === n) vc.release();
          part.sustained.clear();
        }
        break;
      case 71: s.rt = { ...s.rt, resonance: rtv }; break;
      case 72: s.rt = { ...s.rt, release: rtv }; break;
      case 73: s.rt = { ...s.rt, attack: rtv }; break;
      case 74: s.rt = { ...s.rt, cutoff: rtv }; break;
      case 75: s.rt = { ...s.rt, decay: rtv }; break;
      case 76: s.rt = { ...s.rt, lfoRate: rtv }; break;
      case 77: s.rt = { ...s.rt, lfoDepth: rtv }; break;
      case 78: s.rt = { ...s.rt, envDepth: rtv }; break;
      case 79: s.rt = { ...s.rt, pitch: rtv }; break;
      case 91: s.rev = v; break;
      case 94: s.dly = v; break;
      case 12: this.efxCtrl[0] = v / 127; this.applyFx(this.fx); break;
      case 13: this.efxCtrl[1] = v / 127; this.applyFx(this.fx); break;
      case 120: case 123: this.releasePart(pi); break;
    }
  }

  private applyDbeam() {
    for (const p of this.parts) {
      p.dbeamCutoff = p.dbeamRes = p.dbeamPitch = p.dbeamLfo = 0;
    }
    const v = this.dbeam;
    const target: DBeamTarget = this.sys.dbeam;
    if (v === null || target === 'off') {
      if (target === 'efx1' || target === 'efx2') {
        this.efxCtrl = [null, null];
        this.applyFx(this.fx);
      }
      return;
    }
    const parts = this.sys.dbeamAllParts ? this.parts : [this.parts[this.focus]];
    for (const p of parts) {
      switch (target) {
        case 'cutoff': p.dbeamCutoff = (v * 2 - 1) * 70; break;
        case 'resonance': p.dbeamRes = v * 90; break;
        case 'cutoff+res': p.dbeamCutoff = (v * 2 - 1) * 60; p.dbeamRes = v * 70; break;
        case 'pitchUp': p.dbeamPitch = v * 12; break;
        case 'pitchDown': p.dbeamPitch = -v * 24; break;
        case 'lfoDepth': p.dbeamLfo = v * 63; break;
      }
    }
    if (target === 'efx1' || target === 'efx2') {
      this.efxCtrl[target === 'efx1' ? 0 : 1] = v;
      this.applyFx(this.fx);
    }
  }

  // ------------------------------------------------------------ live input

  private liveNote(pi: number, note: number, vel: number, record: boolean) {
    if (this.arp.on && pi === this.arpPart && pi !== 0) {
      this.arpInput(note, vel);
      return;
    }
    if (vel > 0) {
      this.noteOn(pi, note, vel, -1);
      if (record && this.recording && this.playing && this.ptick >= 0) {
        this.recHeld.set(`${pi}:${note}`, { t: Math.round(this.ptick), v: vel });
      }
    } else {
      this.noteOff(pi, note);
      this.finishRec(pi, note);
    }
  }

  private finishRec(pi: number, note: number) {
    const key = `${pi}:${note}`;
    const h = this.recHeld.get(key);
    if (!h) return;
    this.recHeld.delete(key);
    let g = Math.round(this.ptick) - h.t;
    if (g <= 0) g += this.lengthTicks;
    this.post({ type: 'rec', part: pi, events: [{ t: h.t, k: 'n', n: note, v: h.v, g: Math.max(1, g) }] });
  }

  private flushRecHeld() {
    for (const key of [...this.recHeld.keys()]) {
      const [pi, n] = key.split(':').map(Number);
      this.finishRec(pi, n);
    }
  }

  private recordEv(pi: number, ev: SeqEv) {
    if (!this.recording || !this.playing || this.ptick < 0) return;
    ev.t = Math.round(this.ptick);
    this.post({ type: 'rec', part: pi, events: [ev] });
  }

  // ------------------------------------------------------------ arpeggiator

  private arpInput(note: number, vel: number) {
    if (vel > 0) {
      if (this.arp.hold && this.arpHeld.length === 0) this.arpLatched = [];
      if (!this.arpHeld.includes(note)) this.arpHeld.push(note);
      if (this.arp.hold && !this.arpLatched.includes(note)) this.arpLatched.push(note);
      this.arpVel = vel;
      const wasIdle = this.arpNextTick < 0;
      this.rebuildArp();
      if (wasIdle) {
        // start on the next step boundary of the grid when playing, immediately otherwise
        const step = ARP_RATE_TICKS[this.arp.rate] ?? 24;
        const base = this.playing ? this.ptick : 0;
        const next = this.playing ? Math.ceil((base + 0.0001) / step) * step - base : 0;
        this.arpNextTick = Math.ceil(this.clk) + Math.round(next);
        this.arpClock = 0;
        this.arpPos = 0;
      }
    } else {
      const k = this.arpHeld.indexOf(note);
      if (k >= 0) this.arpHeld.splice(k, 1);
      this.rebuildArp();
    }
  }

  private arpNotes() {
    return this.arp.hold ? this.arpLatched : this.arpHeld;
  }

  private rebuildArp() {
    const order = this.arpNotes();
    if (!order.length) {
      this.arpSteps = [];
      this.arpNextTick = -1;
      return;
    }
    const style = ARP_MAP[this.arp.style] ?? ARP_MAP.up;
    const sorted = [...order].sort((a, b) => a - b);
    this.arpSteps = style.build(sorted, order, this.arp.octaves || 1);
    if (this.arpPos >= this.arpSteps.length) this.arpPos = 0;
  }

  private arpTick(tick: number) {
    if (this.arpNextTick < 0 || !this.arp.on || !this.arpSteps.length) return;
    if (tick < this.arpNextTick) return;
    const stepTicks = ARP_RATE_TICKS[this.arp.rate] ?? 24;
    const mask = (BEAT_MAP[this.arp.beat] ?? BEAT_MAP.all).mask;
    const m = mask[this.arpClock % mask.length];
    const swingNext = this.arpClock % 2 === 0 ? Math.round(stepTicks * (this.arp.shuffle / 100) * 0.5) : -Math.round(stepTicks * (this.arp.shuffle / 100) * 0.5);
    this.arpClock++;
    this.arpNextTick = tick + stepTicks + swingNext;
    if (m === '.') return;
    const style = ARP_MAP[this.arp.style] ?? ARP_MAP.up;
    let st: ArpStep;
    if (style.random) st = this.arpSteps[Math.floor(Math.random() * this.arpSteps.length)];
    else {
      st = this.arpSteps[this.arpPos % this.arpSteps.length];
      this.arpPos = (this.arpPos + 1) % this.arpSteps.length;
    }
    if (!st.notes.length) return;
    const baseVel = this.arp.velocity || this.arpVel;
    const acc = this.arp.accent / 100;
    const accented = m === 'X';
    const vel = clamp(Math.round(baseVel * st.vel * (accented ? 1 : 1 - acc * 0.45) * (accented ? 1 + acc * 0.2 : 1)), 1, 127);
    const gate = Math.max(1, Math.round((stepTicks * this.arp.gate) / 100));
    for (const n of st.notes) {
      if (n < 0 || n > 127) continue;
      this.noteOn(this.arpPart, n, vel, SRC_ARP);
      this.pending.push({ at: tick + gate, part: this.arpPart, note: n, src: SRC_ARP });
      if (this.recording && this.playing && this.ptick >= 0) {
        this.post({ type: 'rec', part: this.arpPart, events: [{ t: Math.round(this.ptick), k: 'n', n, v: vel, g: gate }] });
      }
    }
  }

  // ------------------------------------------------------------ RPS

  private rpsPad(slot: number, on: boolean) {
    const phrase = this.rpsPhrases[slot];
    if (!phrase) return;
    const existing = this.rpsActive.find((a) => a.slot === slot);
    if (on) {
      if (existing) {
        if (this.rpsHold) {
          this.stopPhrase(existing);
          return;
        }
        existing.stopping = false;
        return;
      }
      const q = this.rpsQuant === 'off' ? 1 : this.rpsQuant === '1/16' ? 24 : this.rpsQuant === 'beat' ? PPQN : this.barTicks;
      let start = Math.ceil(this.clk);
      if (this.playing && q > 1) {
        const pos = Math.max(0, this.ptick);
        const wait = (q - (Math.round(pos) % q)) % q;
        start = Math.round(this.clk) + wait;
      }
      // replace any phrase on the same target part
      for (const a of this.rpsActive) if (a.phrase.target === phrase.target) this.stopPhrase(a);
      this.rpsActive.push({ slot, start, idx: 0, phrase, stopping: false, notes: new Set() });
    } else if (existing && !this.rpsHold) this.stopPhrase(existing);
  }

  private stopPhrase(a: ActivePhrase) {
    this.rpsActive = this.rpsActive.filter((x) => x !== a);
    const src = SRC_RPS + a.slot;
    this.releaseSrc(src);
  }

  private rpsTick(tick: number) {
    for (const a of this.rpsActive) {
      const local = tick - a.start;
      if (local < 0) continue;
      const len = a.phrase.length;
      const lt = local % len;
      if (lt === 0) a.idx = 0;
      const evs = a.phrase.events;
      while (a.idx < evs.length && evs[a.idx].t < lt) a.idx++;
      while (a.idx < evs.length && evs[a.idx].t === lt) {
        this.fireEv(a.phrase.target, evs[a.idx], 1, tick, SRC_RPS + a.slot);
        a.idx++;
      }
    }
  }

  // ------------------------------------------------------------ megamix

  private applyMegaPending() {
    for (const m of this.megaPending) {
      if (!m.events) this.mega[m.part] = null;
      else {
        const events = m.events.filter((e) => e.t >= 0 && e.t < m.length).map((ev) => ({ pt: ev.t, ev, vel: 1 })).sort((a, b) => a.pt - b.pt);
        this.mega[m.part] = { events, length: m.length, idx: 0 };
      }
      this.releasePart(m.part);
    }
    this.megaPending = [];
    this.seekIdx(Math.max(0, Math.round(this.ptick)));
  }

  // ------------------------------------------------------------ sequencer

  private fireEv(pi: number, ev: SeqEv, velF: number, tick: number, src: number) {
    if (ev.k === 'n') {
      const v = clamp(Math.round(ev.v * velF), 1, 127);
      if (this.arp.on && pi === this.arpPart && pi !== 0 && src === SRC_SEQ) {
        // sequenced notes on the arp part drive the arpeggiator, like the hardware
        this.arpInput(ev.n, v);
        this.pending.push({ at: tick + Math.max(1, ev.g), part: pi, note: -ev.n - 1, src });
        return;
      }
      this.noteOn(pi, ev.n, v, src);
      this.pending.push({ at: tick + Math.max(1, ev.g), part: pi, note: ev.n, src });
    } else if (ev.k === 'c') this.applyCc(pi, ev.c, ev.v);
    else this.parts[pi].bend = clamp(ev.v / 8192, -1, 1);
  }

  private processTick() {
    const tick = Math.round(this.clk);
    if (this.startPending) {
      this.startPending = false;
      this.playing = true;
      this.ptick = this.countIn ? -this.barTicks : 0;
      this.seekIdx(0);
      if (this.sys.midi.clockOut) this.midiOut.push([this.renderOffset, [0xfa]]);
    }
    // note offs first so retriggers on the same tick work
    if (this.pending.length) {
      const keep: Pending[] = [];
      for (const p of this.pending) {
        if (p.at <= tick) {
          if (p.note < 0) this.arpInput(-p.note - 1, 0);
          else this.noteOff(p.part, p.note, p.src);
        } else keep.push(p);
      }
      this.pending = keep;
    }
    if (this.playing) {
      let pt = Math.round(this.ptick);
      if (pt >= this.lengthTicks) {
        this.ptick -= this.lengthTicks;
        pt -= this.lengthTicks;
        let switched = false;
        if (this.queued) {
          const q = this.queued;
          this.queued = null;
          this.releaseSrc(SRC_SEQ);
          this.loadPattern(q);
          switched = true;
        }
        this.seekIdx(0);
        this.post({ type: 'wrap', patternId: this.pattern.id, switched });
      }
      if (pt >= 0) {
        if (this.megaPending.length && pt % this.barTicks === 0) this.applyMegaPending();
        // mute control track
        while (this.muteIdx < this.mutePlay.length && this.mutePlay[this.muteIdx].t <= pt) {
          const m = this.mutePlay[this.muteIdx++];
          if (m.t === pt && this.parts[m.part]) {
            this.parts[m.part].setup = { ...this.parts[m.part].setup, mute: m.mute };
            if (m.mute) this.releasePart(m.part);
          }
        }
        for (let i = 0; i < NUM_PARTS; i++) {
          const muted = this.parts[i].setup.mute;
          const mg = this.mega[i];
          if (mg) {
            const lt = pt % mg.length;
            if (lt === 0) mg.idx = 0;
            while (mg.idx < mg.events.length && mg.events[mg.idx].pt < lt) mg.idx++;
            while (mg.idx < mg.events.length && mg.events[mg.idx].pt === lt) {
              const e = mg.events[mg.idx++];
              if (!muted) this.fireEv(i, e.ev, e.vel, tick, SRC_SEQ);
            }
            continue;
          }
          const arr = this.play[i];
          let k = this.playIdx[i];
          while (k < arr.length && arr[k].pt < pt) k++;
          while (k < arr.length && arr[k].pt === pt) {
            const e = arr[k++];
            if (!muted || e.ev.k !== 'n') this.fireEv(i, e.ev, e.vel, tick, SRC_SEQ);
          }
          this.playIdx[i] = k;
        }
      }
      // metronome
      if (pt % PPQN === 0) {
        const mode = this.sys.metronome;
        const counting = pt < 0;
        if (mode === 'always' || (mode === 'rec' && (this.recording || counting))) {
          const down = ((pt % this.barTicks) + this.barTicks) % this.barTicks === 0;
          this.clickFreq = down ? 2000 : 1300;
          this.clickEnv = 1;
          this.clickPh = 0;
        }
      }
      if (this.sys.midi.clockOut && pt % 4 === 0) this.midiOut.push([this.renderOffset, [0xf8]]);
    }
    this.arpTick(tick);
    if (this.rpsActive.length) this.rpsTick(tick);
  }

  // ------------------------------------------------------------ render

  render(outL: Float32Array, outR: Float32Array, n: number) {
    for (const p of this.parts) {
      p.l.fill(0, 0, n); p.r.fill(0, 0, n);
      p.revL.fill(0, 0, n); p.revR.fill(0, 0, n);
      p.dlyL.fill(0, 0, n); p.dlyR.fill(0, 0, n);
    }
    // turntable stop: slow everything down
    if (this.stopping) {
      this.speed -= n / (this.sr * Math.max(0.1, this.sys.turntableTime));
      if (this.speed <= 0.02) this.doStop();
    }
    for (const v of this.voices) if (!v.free) v.speed = Math.max(0.02, this.speed);
    for (const d of this.drums) if (!d.free) d.speed = Math.max(0.02, this.speed);

    let pos = 0;
    while (pos < n) {
      const tps = (this.tempo * PPQN) / 60 / this.sr * this.speed;
      const next = Math.floor(this.clk + 1e-9) + 1;
      const toTick = (next - this.clk) / tps;
      const seg = Math.max(1, Math.min(n - pos, Math.ceil(toTick - 1e-9)));
      this.renderVoices(pos, seg);
      this.clk += seg * tps;
      if (this.playing) this.ptick += seg * tps;
      this.time += seg / this.sr;
      pos += seg;
      if (this.clk >= next - 1e-9) {
        this.renderOffset = pos;
        this.processTick();
      }
    }
    this.mix(outL, outR, n);
    this.frame += n;
    this.report(n);
  }

  private renderVoices(off: number, len: number) {
    for (const v of this.voices) if (!v.free) v.render(off, len);
    for (const d of this.drums) if (!d.free) d.render(off, len);
  }

  private mix(outL: Float32Array, outR: Float32Array, n: number) {
    const dryL = this.dryL, dryR = this.dryR, efxL = this.efxL, efxR = this.efxR;
    const revL = this.revL, revR = this.revR, dlyL = this.dlyL, dlyR = this.dlyR;
    dryL.fill(0); dryR.fill(0); efxL.fill(0); efxR.fill(0);
    revL.fill(0); revR.fill(0); dlyL.fill(0); dlyR.fill(0);
    this.efxOutL.fill(0); this.efxOutR.fill(0);
    let efxUsed = false;
    const dbSend = this.dbeam !== null && (this.sys.dbeam === 'reverb' || this.sys.dbeam === 'delay') ? this.dbeam : 0;
    this.filterRhythm(n);
    for (let pi = 0; pi < NUM_PARTS; pi++) {
      const p = this.parts[pi];
      const s = p.setup;
      let g = s.mute ? 0 : level(s.level) * p.expr * 1.4;
      if (this.dbeam !== null && this.sys.dbeam === 'level' && (this.sys.dbeamAllParts || pi === this.focus)) g *= this.dbeam;
      const pn = s.pan / 64;
      const gl = g * Math.min(1, 1 - pn) ;
      const gr = g * Math.min(1, 1 + pn);
      let rs = level(s.rev);
      let ds = level(s.dly);
      if (dbSend && (this.sys.dbeamAllParts || pi === this.focus)) {
        if (this.sys.dbeam === 'reverb') rs = Math.min(1, rs + dbSend);
        else ds = Math.min(1, ds + dbSend);
      }
      const dst = s.efx ? efxL : dryL;
      const dstR = s.efx ? efxR : dryR;
      if (s.efx) efxUsed = true;
      let peak = 0;
      const L = p.l, R = p.r;
      for (let i = 0; i < n; i++) {
        const l = L[i] * gl;
        const r = R[i] * gr;
        dst[i] += l;
        dstR[i] += r;
        if (!s.efx) {
          revL[i] += l * rs; revR[i] += r * rs;
          dlyL[i] += l * ds; dlyR[i] += r * ds;
        }
        const a = Math.abs(l) + Math.abs(r);
        if (a > peak) peak = a;
      }
      if (pi === 0 && g > 0) {
        for (let i = 0; i < n; i++) {
          revL[i] += p.revL[i] * g; revR[i] += p.revR[i] * g;
          dlyL[i] += p.dlyL[i] * g; dlyR[i] += p.dlyR[i] * g;
        }
      }
      p.peak = Math.max(p.peak * 0.9, peak * 0.5);
      this.peaks[pi] = Math.max(this.peaks[pi], p.peak);
    }
    if (efxUsed) {
      const beat = (this.playing ? Math.max(0, this.ptick) : this.clk) / PPQN;
      this.efx.process(efxL, efxR, this.efxOutL, this.efxOutR, n, this.tempo, beat);
      const ers = level(this.fx.efx.rev);
      const eds = level(this.fx.efx.dly);
      for (let i = 0; i < n; i++) {
        const l = this.efxOutL[i];
        const r = this.efxOutR[i];
        dryL[i] += l; dryR[i] += r;
        revL[i] += l * ers; revR[i] += r * ers;
        dlyL[i] += l * eds; dlyR[i] += r * eds;
      }
    }
    this.delay.process(dlyL, dlyR, dryL, dryR, n, this.tempo, revL, revR);
    this.reverb.process(revL, revR, dryL, dryR, n);
    // master
    const mg = level(this.sys.masterLevel) * 1.25;
    const lb = this.sys.lowBoost.on;
    const metro = level(this.sys.metroLevel) * 0.5;
    let pl = this.masterPeak[0], pr = this.masterPeak[1];
    for (let i = 0; i < n; i++) {
      let l = dryL[i];
      let r = dryR[i];
      if (lb) {
        l = this.lowShelf[0].tick(l);
        r = this.lowShelf[1].tick(r);
      }
      l *= mg;
      r *= mg;
      if (this.clickEnv > 0.0005) {
        this.clickPh += this.clickFreq / this.sr;
        const c = Math.sin(this.clickPh * Math.PI * 2) * this.clickEnv * metro;
        this.clickEnv *= 0.9985;
        l += c;
        r += c;
      }
      // gentle limiter
      l = l > 0.9 || l < -0.9 ? Math.tanh(l) : l;
      r = r > 0.9 || r < -0.9 ? Math.tanh(r) : r;
      outL[i] = l;
      outR[i] = r;
      const al = Math.abs(l), ar = Math.abs(r);
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
    }
    this.masterPeak = [pl, pr];
  }

  /** The rhythm part has no per-voice filter, so realtime CUTOFF/RESONANCE act as a DJ filter on its bus. */
  private filterRhythm(n: number) {
    const p = this.parts[0];
    const cut = p.setup.rt.cutoff + p.dbeamCutoff;
    const res = clamp((p.setup.rt.resonance + p.dbeamRes) / 127, 0, 0.95);
    if (Math.abs(cut) < 1 && res < 0.01) {
      this.rhythmFilt[0].reset();
      this.rhythmFilt[1].reset();
      return;
    }
    const lp = cut <= 0;
    const t = Math.abs(cut) / 63;
    const hz = lp ? 20000 * Math.pow(2, -t * 9) : 20 * Math.pow(2, t * 9);
    for (const f of this.rhythmFilt) f.set(hz, res, this.sr);
    const fl = this.rhythmFilt[0];
    const fr = this.rhythmFilt[1];
    const bufs: [Float32Array, Float32Array][] = [[p.l, p.r], [p.revL, p.revR], [p.dlyL, p.dlyR]];
    // main bus through the filter; sends follow the same tone by scaling with the bus energy ratio
    let before = 0;
    let after = 0;
    for (let i = 0; i < n; i++) {
      before += Math.abs(p.l[i]) + Math.abs(p.r[i]);
      fl.tick(p.l[i]);
      fr.tick(p.r[i]);
      p.l[i] = lp ? fl.lp : fl.hp;
      p.r[i] = lp ? fr.lp : fr.hp;
      after += Math.abs(p.l[i]) + Math.abs(p.r[i]);
    }
    const ratio = before > 1e-9 ? Math.min(2, after / before) : 1;
    for (const [a, b] of bufs.slice(1)) for (let i = 0; i < n; i++) { a[i] *= ratio; b[i] *= ratio; }
  }

  private report(n: number) {
    if (this.midiOut.length) {
      this.post({ type: 'midi', frame: this.frame - n, events: this.midiOut });
      this.midiOut = [];
    }
    this.reportCtr += n;
    if (this.reportCtr < this.sr / 40) return;
    this.reportCtr = 0;
    let voices = 0;
    for (const v of this.voices) if (!v.free) voices++;
    for (const d of this.drums) if (!d.free) voices++;
    this.post({
      type: 'pos',
      tick: this.playing ? this.ptick : 0,
      playing: this.playing,
      recording: this.recording,
      patternId: this.pattern.id,
      meters: [...this.peaks],
      master: [...this.masterPeak] as [number, number],
      hits: [...this.hits],
      drumHits: this.drumHits,
      voices,
      rpsActive: this.rpsActive.map((a) => a.slot),
      speed: this.speed,
      heldArp: this.arpNotes().length,
    });
    this.peaks.fill(0);
    this.hits.fill(0);
    this.drumHits = [];
    this.masterPeak = [0, 0];
  }
}

export const engineClone = clone;
