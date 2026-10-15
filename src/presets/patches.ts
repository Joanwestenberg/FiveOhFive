// Preset patch library. Built from a compact spec so the sounds stay readable and tweakable.
// Envelope shorthands: a = amp [t1,t2,t3,t4,l1,l2,l3], f = filter [t1,t2,t3,t4,l0,l1,l2,l3,l4],
// p = pitch [t1,t2,t3,t4,l0,l1,l2,l3,l4]. Times are 0-127 (64 ≈ 1.3 s), levels 0-127 (pitch ±63).

import type { Lfo, Patch, Tone } from '../model/types';
import { defaultPatch, defaultTone } from '../model/defaults';

type ToneSpec = Partial<Omit<Tone, 'aenv' | 'fenv' | 'penv' | 'lfo1' | 'lfo2'>> & {
  a?: number[];
  f?: number[];
  p?: number[];
  l1?: Partial<Lfo>;
  l2?: Partial<Lfo>;
};
type PatchSpec = Partial<Omit<Patch, 'tones' | 'name' | 'category'>> & { t2?: ToneSpec };

const tone = (s: ToneSpec, on = true): Tone => {
  const t = defaultTone(on);
  const { a, f, p, l1, l2, ...rest } = s;
  Object.assign(t, rest);
  if (a) t.aenv = { t1: a[0], t2: a[1], t3: a[2], t4: a[3], l1: a[4], l2: a[5], l3: a[6] };
  if (f) t.fenv = { t1: f[0], t2: f[1], t3: f[2], t4: f[3], l0: f[4], l1: f[5], l2: f[6], l3: f[7], l4: f[8] };
  if (p) t.penv = { t1: p[0], t2: p[1], t3: p[2], t4: p[3], l0: p[4], l1: p[5], l2: p[6], l3: p[7], l4: p[8] };
  if (l1) t.lfo1 = { ...t.lfo1, ...l1 };
  if (l2) t.lfo2 = { ...t.lfo2, ...l2 };
  return t;
};

const P = (name: string, category: string, t1: ToneSpec, opts: PatchSpec = {}): Patch => {
  const base = defaultPatch(name);
  const { t2, ...rest } = opts;
  return { ...base, ...rest, name, category, tones: [tone(t1), t2 ? tone(t2) : tone({}, false)] };
};

// common envelopes
const PLUCK_A = [0, 50, 0, 20, 127, 0, 0];
const ORGAN_A = [0, 0, 0, 8, 127, 127, 127];
const PAD_A = [55, 60, 0, 60, 127, 110, 110];
const STR_A = [45, 60, 0, 50, 127, 115, 115];
const KEY_A = [0, 75, 80, 35, 127, 70, 0];
const ACID_F = [0, 42, 0, 20, 0, 127, 0, 0, 0];
const VIB: Partial<Lfo> = { wave: 'tri', rate: 85, delay: 50, fade: 50, pitch: 6 };

export const PRESET_PATCHES: Patch[] = [
  // ---------------------------------------------------------------- ACID
  P('ACID LINE', 'ACID', { wave: 'tbsaw', cutoff: 42, resonance: 108, fenvDepth: 34, fenvVelSens: 30, f: ACID_F, a: [0, 60, 0, 8, 127, 110, 100], drive: 20 }, { mono: true, legato: true, portamento: true, portaTime: 22 }),
  P('ACID SQUARE', 'ACID', { wave: 'tbsqr', cutoff: 38, resonance: 104, fenvDepth: 36, fenvVelSens: 30, f: ACID_F, a: [0, 60, 0, 8, 127, 110, 100], drive: 25 }, { mono: true, legato: true, portamento: true, portaTime: 22 }),
  P('ACID SCREAM', 'ACID', { wave: 'tbsaw', cutoff: 50, resonance: 120, fenvDepth: 40, fenvVelSens: 40, f: [0, 35, 0, 20, 0, 127, 0, 0, 0], a: [0, 60, 0, 8, 127, 110, 100], drive: 70 }, { mono: true, legato: true, portamento: true, portaTime: 18 }),
  P('ACID SOFT', 'ACID', { wave: 'tbsaw', cutoff: 35, resonance: 90, fenvDepth: 26, f: [0, 55, 0, 20, 0, 127, 10, 10, 0], a: [0, 60, 0, 8, 127, 110, 100] }, { mono: true, legato: true, portamento: true, portaTime: 30 }),
  P('ACID 24DB', 'ACID', { wave: 'tbsaw', filterType: 'lpf24', cutoff: 44, resonance: 100, fenvDepth: 38, f: ACID_F, a: [0, 60, 0, 8, 127, 110, 100], drive: 40 }, { mono: true, legato: true, portamento: true, portaTime: 20 }),
  P('ACID DIST', 'ACID', { wave: 'tbsqr', cutoff: 46, resonance: 112, fenvDepth: 32, f: ACID_F, a: [0, 60, 0, 8, 127, 110, 100], drive: 110 }, { mono: true, legato: true, portamento: true, portaTime: 20 }),
  // ---------------------------------------------------------------- BASS
  P('ANALOG BASS', 'BASS', { wave: 'saw', cutoff: 48, resonance: 40, fenvDepth: 28, f: [0, 40, 0, 20, 0, 127, 20, 20, 0], a: [0, 60, 0, 15, 127, 120, 120] }, { mono: true, t2: { wave: 'square', coarse: -12, cutoff: 60, level: 90, a: [0, 60, 0, 15, 127, 120, 120] } }),
  P('SUB BASS', 'BASS', { wave: 'sine', filterType: 'off', a: [0, 60, 0, 18, 127, 127, 127], level: 127 }, { mono: true, t2: { wave: 'tri', coarse: 12, level: 30, filterType: 'off', a: [0, 30, 0, 18, 127, 0, 0] } }),
  P('808 BOOM', 'BASS', { wave: 'sine', filterType: 'off', a: [0, 85, 0, 30, 127, 0, 0], p: [0, 25, 0, 0, 10, 0, 0, 0, 0], penvDepth: 12, drive: 35, level: 120 }, { mono: true }),
  P('REESE', 'BASS', { wave: 'saw', cutoff: 62, resonance: 20, a: [0, 0, 0, 20, 127, 127, 127], fine: -12 }, { mono: true, t2: { wave: 'saw', fine: 12, cutoff: 62, resonance: 20, a: [0, 0, 0, 20, 127, 127, 127] }, analogFeel: 30 }),
  P('HOOVER BASS', 'BASS', { wave: 'supersaw', waveParam: 100, cutoff: 75, resonance: 10, a: [0, 0, 0, 25, 127, 127, 127], l1: { wave: 'tri', rate: 70, pitch: 4 } }, { mono: true, portamento: true, portaTime: 45 }),
  P('FM BASS', 'BASS', { wave: 'fmbass', waveParam: 80, cutoff: 80, a: [0, 60, 0, 15, 127, 80, 60] }, { mono: true }),
  P('PICK BASS', 'BASS', { wave: 'pluck', waveParam: 90, cutoff: 70, fenvDepth: 15, f: [0, 30, 0, 20, 0, 127, 30, 30, 0], a: [0, 80, 0, 15, 127, 60, 0] }),
  P('WOBBLE BASS', 'BASS', { wave: 'saw', cutoff: 45, resonance: 70, a: [0, 0, 0, 15, 127, 127, 127], l1: { wave: 'sin', sync: '1/8', filter: 40, keySync: true } }, { mono: true, t2: { wave: 'square', coarse: -12, cutoff: 45, resonance: 60, level: 90, a: [0, 0, 0, 15, 127, 127, 127], l1: { wave: 'sin', sync: '1/8', filter: 40, keySync: true } } }),
  P('HOUSE ORG BASS', 'BASS', { wave: 'organ4', cutoff: 70, a: [0, 50, 0, 12, 127, 60, 0] }, { mono: true }),
  P('SYNC BASS', 'BASS', { wave: 'syncsaw', waveParam: 30, cutoff: 70, resonance: 30, a: [0, 60, 0, 15, 127, 100, 90], p: [0, 0, 0, 0, 0, 0, 0, 0, 0] }, { mono: true }),
  P('ELECTRO BASS', 'BASS', { wave: 'square', cutoff: 55, resonance: 60, fenvDepth: 30, f: [0, 30, 0, 15, 0, 127, 0, 0, 0], a: [0, 50, 0, 10, 127, 90, 0], drive: 40 }, { mono: true }),
  P('DUB BASS', 'BASS', { wave: 'sine', filterType: 'lpf', cutoff: 60, a: [0, 70, 0, 20, 127, 110, 100], drive: 50 }, { mono: true, t2: { wave: 'tri', cutoff: 55, level: 70, a: [0, 70, 0, 20, 127, 110, 100] } }),
  P('FUNK BASS', 'BASS', { wave: 'pulse', waveParam: 40, cutoff: 50, resonance: 50, fenvDepth: 30, fenvVelSens: 40, f: [0, 35, 0, 15, 0, 127, 20, 20, 0], a: [0, 60, 0, 12, 127, 90, 70] }, { mono: true }),
  P('GROWL BASS', 'BASS', { wave: 'fmsub', waveParam: 90, cutoff: 65, resonance: 50, a: [0, 0, 0, 15, 127, 127, 127], l1: { wave: 'tri', sync: '1/16', filter: 25, keySync: true } }, { mono: true }),
  // ---------------------------------------------------------------- LEAD
  P('SAW LEAD', 'LEAD', { wave: 'saw', cutoff: 95, resonance: 30, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB }, { mono: true, portamento: true, portaTime: 25, t2: { wave: 'saw', fine: 8, cutoff: 95, resonance: 30, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB } }),
  P('SQUARE LEAD', 'LEAD', { wave: 'square', cutoff: 85, resonance: 20, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB }, { mono: true, portamento: true, portaTime: 20 }),
  P('SUPERSAW LEAD', 'LEAD', { wave: 'supersaw', waveParam: 70, cutoff: 100, a: [0, 0, 0, 30, 127, 127, 127], l1: VIB }, { mono: false }),
  P('SYNC LEAD', 'LEAD', { wave: 'syncsaw', waveParam: 20, cutoff: 100, a: [0, 0, 0, 25, 127, 127, 127], l1: { wave: 'tri', rate: 40, filter: 0, pitch: 0 }, l2: VIB }, { mono: true, portamento: true, portaTime: 20 }),
  P('SINE WHISTLE', 'LEAD', { wave: 'sine', filterType: 'off', a: [10, 0, 0, 30, 127, 127, 127], l1: { ...VIB, pitch: 8 } }, { mono: true, portamento: true, portaTime: 35 }),
  P('PWM LEAD', 'LEAD', { wave: 'pulse', waveParam: 64, cutoff: 90, a: [0, 0, 0, 25, 127, 127, 127], l2: { wave: 'tri', rate: 60, pitch: 0 }, l1: VIB }, { mono: true, portamento: true, portaTime: 20 }),
  P('ACID LEAD', 'LEAD', { wave: 'saw', cutoff: 60, resonance: 100, fenvDepth: 30, f: [0, 50, 0, 20, 0, 127, 30, 30, 0], a: [0, 0, 0, 20, 127, 127, 127], drive: 50 }, { mono: true, legato: true, portamento: true, portaTime: 25 }),
  P('FM LEAD', 'LEAD', { wave: 'fbosc', waveParam: 100, cutoff: 100, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB }, { mono: true }),
  P('FAT LEAD', 'LEAD', { wave: 'saw', cutoff: 85, resonance: 25, drive: 50, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB }, { mono: true, portamento: true, portaTime: 25, t2: { wave: 'square', coarse: -12, fine: 5, cutoff: 80, a: [0, 0, 0, 25, 127, 127, 127] } }),
  P('DIGI LEAD', 'LEAD', { wave: 'digi1', cutoff: 110, a: [0, 0, 0, 25, 127, 127, 127], l1: VIB }, { mono: true }),
  P('FLUTE LEAD', 'LEAD', { wave: 'flute', cutoff: 100, a: [20, 0, 0, 30, 127, 127, 127], l1: { ...VIB, pitch: 5, amp: 6 } }, { mono: true, portamento: true, portaTime: 15, t2: { wave: 'noise', filterType: 'bpf', cutoff: 105, resonance: 40, level: 30, a: [10, 40, 0, 20, 127, 40, 30] } }),
  P('RING LEAD', 'LEAD', { wave: 'saw', cutoff: 100, a: [0, 0, 0, 25, 127, 127, 127] }, { mono: true, structure: 'ring', structureDepth: 80, t2: { wave: 'sine', coarse: 7, fine: 3 } }),
  P('HOOVER', 'LEAD', { wave: 'supersaw', waveParam: 110, cutoff: 90, a: [0, 0, 0, 30, 127, 127, 127], p: [0, 30, 0, 30, -20, 0, 0, 0, -10], penvDepth: 12, l1: { wave: 'tri', rate: 75, pitch: 6 } }, { mono: true, portamento: true, portaTime: 50 }),
  // ---------------------------------------------------------------- PAD
  P('WARM PAD', 'PAD', { wave: 'saw', cutoff: 70, resonance: 10, a: PAD_A, l1: { wave: 'tri', rate: 40, pitch: 3 } }, { t2: { wave: 'saw', fine: 10, cutoff: 70, a: PAD_A, l1: { wave: 'tri', rate: 45, pitch: 3 } } }),
  P('SUPERSAW PAD', 'PAD', { wave: 'supersaw', waveParam: 80, cutoff: 85, a: PAD_A }),
  P('SWEEP PAD', 'PAD', { wave: 'saw', cutoff: 55, resonance: 60, a: PAD_A, l1: { wave: 'tri', rate: 15, filter: 35 } }, { t2: { wave: 'pulse', waveParam: 30, fine: 7, cutoff: 55, resonance: 60, a: PAD_A, l1: { wave: 'tri', rate: 15, filter: 35 } } }),
  P('GLASS PAD', 'PAD', { wave: 'glass', cutoff: 100, a: PAD_A, l1: { wave: 'sin', rate: 30, pitch: 2 } }, { t2: { wave: 'hollow', coarse: 12, level: 70, a: PAD_A } }),
  P('VOX PAD', 'PAD', { wave: 'voxa', cutoff: 100, a: [60, 60, 0, 60, 127, 120, 120], l1: { wave: 'tri', rate: 50, pitch: 4 } }, { t2: { wave: 'voxo', fine: 9, cutoff: 100, a: [60, 60, 0, 60, 127, 120, 120] } }),
  P('DARK PAD', 'PAD', { wave: 'saw', cutoff: 50, resonance: 30, a: [70, 60, 0, 70, 127, 120, 120], l1: { wave: 'rnd', rate: 30, filter: 15 } }, { analogFeel: 60, t2: { wave: 'square', coarse: -12, cutoff: 45, a: [70, 60, 0, 70, 127, 120, 120] } }),
  P('PWM PAD', 'PAD', { wave: 'pulse', waveParam: 50, cutoff: 80, a: PAD_A, l1: { wave: 'tri', rate: 35, pitch: 2 } }, { t2: { wave: 'pulse', waveParam: 80, fine: -8, cutoff: 80, a: PAD_A } }),
  P('DIGI PAD', 'PAD', { wave: 'digi2', cutoff: 90, a: PAD_A, l1: { wave: 'sin', rate: 25, filter: 15 } }, { t2: { wave: 'digi1', coarse: 12, level: 60, cutoff: 80, a: PAD_A } }),
  P('SPACE PAD', 'PAD', { wave: 'fmmetal', waveParam: 40, cutoff: 85, a: [80, 70, 0, 80, 127, 110, 110], l1: { wave: 'tri', rate: 20, pan: 50 } }, { t2: { wave: 'sine', coarse: 19, level: 60, a: [80, 70, 0, 80, 127, 110, 110], l1: { wave: 'tri', rate: 22, pan: -50 } } }),
  P('NOISE PAD', 'PAD', { wave: 'pink', filterType: 'bpf', cutoff: 80, resonance: 80, a: PAD_A, l1: { wave: 'tri', rate: 10, filter: 30 }, cutoffKeyFollow: 100 }),
  // ---------------------------------------------------------------- STRINGS
  P('STRING MACHINE', 'STRINGS', { wave: 'strings', cutoff: 90, a: STR_A, l1: { wave: 'tri', rate: 70, pitch: 3 } }, { t2: { wave: 'saw', fine: 7, cutoff: 80, level: 80, a: STR_A, l1: { wave: 'tri', rate: 65, pitch: 3 } } }),
  P('ORCH STRINGS', 'STRINGS', { wave: 'strings', cutoff: 85, a: [50, 60, 0, 55, 127, 120, 120], l1: { ...VIB, pitch: 4 } }, { t2: { wave: 'strings', coarse: 12, level: 60, cutoff: 80, a: [55, 60, 0, 55, 127, 120, 120] } }),
  P('STRING STAB', 'STRINGS', { wave: 'strings', cutoff: 90, a: [0, 55, 0, 30, 127, 40, 0] }, { t2: { wave: 'saw', coarse: 12, level: 60, cutoff: 85, a: [0, 50, 0, 30, 127, 30, 0] } }),
  P('PIZZICATO', 'STRINGS', { wave: 'pluck', waveParam: 60, cutoff: 85, a: [0, 50, 0, 15, 127, 0, 0] }),
  // ---------------------------------------------------------------- BRASS
  P('SYNTH BRASS', 'BRASS', { wave: 'saw', cutoff: 50, resonance: 20, fenvDepth: 25, f: [25, 50, 0, 30, 0, 127, 90, 90, 0], a: [10, 0, 0, 25, 127, 127, 127] }, { t2: { wave: 'saw', fine: 9, cutoff: 50, fenvDepth: 25, f: [25, 50, 0, 30, 0, 127, 90, 90, 0], a: [10, 0, 0, 25, 127, 127, 127] } }),
  P('BRASS STAB', 'BRASS', { wave: 'brass', cutoff: 60, fenvDepth: 30, f: [0, 40, 0, 20, 0, 127, 30, 30, 0], a: [0, 50, 0, 20, 127, 60, 0] }),
  P('POLY BRASS', 'BRASS', { wave: 'brass', cutoff: 55, fenvDepth: 28, f: [30, 55, 0, 30, 0, 127, 100, 100, 0], a: [15, 0, 0, 25, 127, 127, 127], l1: VIB }),
  P('HORN SECTION', 'BRASS', { wave: 'brass', cutoff: 65, fenvDepth: 20, f: [20, 45, 0, 25, 30, 127, 100, 100, 0], a: [8, 0, 0, 25, 127, 127, 127], l1: { ...VIB, pitch: 4 } }, { t2: { wave: 'saw', coarse: 12, level: 50, cutoff: 70, a: [8, 0, 0, 25, 127, 127, 127] } }),
  // ---------------------------------------------------------------- KEYS
  P('E.PIANO', 'KEYS', { wave: 'epiano', waveParam: 70, filterType: 'off', a: KEY_A, l1: { wave: 'sin', rate: 70, amp: 10 } }),
  P('TINE PIANO', 'KEYS', { wave: 'tine', waveParam: 80, filterType: 'off', a: KEY_A }, { t2: { wave: 'epiano', waveParam: 40, filterType: 'off', level: 90, a: KEY_A } }),
  P('HOUSE PIANO', 'KEYS', { wave: 'piano', waveParam: 90, cutoff: 110, a: [0, 85, 90, 35, 127, 60, 0] }, { t2: { wave: 'piano', waveParam: 60, fine: 6, coarse: 12, level: 50, a: [0, 70, 80, 35, 127, 50, 0] } }),
  P('CLAVI', 'KEYS', { wave: 'clav', cutoff: 75, resonance: 40, fenvDepth: 25, fenvVelSens: 40, f: [0, 30, 0, 15, 0, 127, 20, 20, 0], a: [0, 60, 0, 15, 127, 50, 0] }),
  P('DIGI PIANO', 'KEYS', { wave: 'digi2', cutoff: 95, a: KEY_A }, { t2: { wave: 'fmbass', waveParam: 50, coarse: 12, level: 60, a: [0, 40, 0, 20, 127, 0, 0] } }),
  P('WURLY', 'KEYS', { wave: 'epiano', waveParam: 110, cutoff: 90, drive: 30, a: KEY_A, l1: { wave: 'sin', rate: 80, amp: 25 } }),
  // ---------------------------------------------------------------- ORGAN
  P('JAZZ ORGAN', 'ORGAN', { wave: 'organ1', filterType: 'off', a: ORGAN_A, l1: { wave: 'sin', rate: 90, pitch: 2 } }),
  P('ROCK ORGAN', 'ORGAN', { wave: 'organ2', filterType: 'off', a: ORGAN_A, drive: 40 }),
  P('FULL ORGAN', 'ORGAN', { wave: 'organ3', cutoff: 110, a: ORGAN_A }),
  P('HOUSE ORGAN', 'ORGAN', { wave: 'organ4', cutoff: 100, a: [0, 45, 0, 10, 127, 40, 0] }),
  P('PERC ORGAN', 'ORGAN', { wave: 'organ1', filterType: 'off', a: ORGAN_A }, { t2: { wave: 'sine', coarse: 19, level: 90, filterType: 'off', a: [0, 35, 0, 5, 127, 0, 0] } }),
  P('CHURCH ORGAN', 'ORGAN', { wave: 'organ3', cutoff: 100, a: [20, 0, 0, 40, 127, 127, 127] }, { t2: { wave: 'organ1', coarse: 12, level: 70, a: [20, 0, 0, 40, 127, 127, 127] } }),
  // ---------------------------------------------------------------- BELL / MALLET
  P('BELL', 'BELL', { wave: 'bell', waveParam: 70, filterType: 'off', a: [0, 95, 0, 60, 127, 0, 0] }),
  P('MALLET', 'BELL', { wave: 'mallet', waveParam: 70, filterType: 'off', a: [0, 60, 0, 30, 127, 0, 0] }),
  P('VIBES', 'BELL', { wave: 'mallet', waveParam: 40, filterType: 'off', a: [0, 80, 0, 40, 127, 0, 0], l1: { wave: 'sin', rate: 75, amp: 30 } }),
  P('MUSIC BOX', 'BELL', { wave: 'sine', filterType: 'off', a: [0, 75, 0, 40, 127, 0, 0] }, { t2: { wave: 'bell', coarse: 24, waveParam: 50, level: 70, filterType: 'off', a: [0, 50, 0, 30, 127, 0, 0] } }),
  P('GLOCKEN', 'BELL', { wave: 'fmmetal', waveParam: 50, filterType: 'off', coarse: 12, a: [0, 70, 0, 40, 127, 0, 0] }),
  P('FM CHIME', 'BELL', { wave: 'tine', waveParam: 120, filterType: 'off', a: [0, 85, 0, 50, 127, 0, 0] }, { t2: { wave: 'bell', coarse: 12, level: 60, filterType: 'off', a: [0, 85, 0, 50, 127, 0, 0] } }),
  // ---------------------------------------------------------------- PLUCK
  P('SYNTH PLUCK', 'PLUCK', { wave: 'saw', cutoff: 55, resonance: 40, fenvDepth: 30, f: [0, 30, 0, 20, 0, 127, 0, 0, 0], a: PLUCK_A }, { t2: { wave: 'saw', fine: 10, cutoff: 55, resonance: 40, fenvDepth: 30, f: [0, 30, 0, 20, 0, 127, 0, 0, 0], a: PLUCK_A } }),
  P('GUITAR', 'PLUCK', { wave: 'guitar', waveParam: 80, cutoff: 95, a: [0, 85, 0, 20, 127, 30, 0] }),
  P('HARP', 'PLUCK', { wave: 'harp', waveParam: 70, cutoff: 100, a: [0, 90, 0, 40, 127, 0, 0] }),
  P('KOTO PLUCK', 'PLUCK', { wave: 'pluck', waveParam: 110, cutoff: 105, a: [0, 70, 0, 20, 127, 0, 0], p: [0, 10, 0, 0, 8, 0, 0, 0, 0], penvDepth: 1 }),
  P('SQR PLUCK', 'PLUCK', { wave: 'square', cutoff: 50, resonance: 30, fenvDepth: 32, f: [0, 25, 0, 15, 0, 127, 0, 0, 0], a: PLUCK_A }),
  P('TRANCE PLUCK', 'PLUCK', { wave: 'supersaw', waveParam: 60, cutoff: 60, resonance: 30, fenvDepth: 30, f: [0, 30, 0, 20, 0, 127, 0, 0, 0], a: [0, 45, 0, 25, 127, 0, 0] }),
  // ---------------------------------------------------------------- VOX
  P('CHOIR AAH', 'VOX', { wave: 'voxa', cutoff: 100, a: [35, 50, 0, 45, 127, 120, 120], l1: { ...VIB, pitch: 4 } }, { t2: { wave: 'voxa', fine: 10, a: [40, 50, 0, 45, 127, 120, 120] } }),
  P('CHOIR OOH', 'VOX', { wave: 'voxo', cutoff: 95, a: [35, 50, 0, 45, 127, 120, 120], l1: { ...VIB, pitch: 4 } }, { t2: { wave: 'voxo', fine: -9, a: [40, 50, 0, 45, 127, 120, 120] } }),
  P('VOX STAB', 'VOX', { wave: 'voxe', cutoff: 100, a: [0, 50, 0, 25, 127, 40, 0] }, { t2: { wave: 'voxa', coarse: 12, level: 70, a: [0, 50, 0, 25, 127, 40, 0] } }),
  P('ROBOT VOX', 'VOX', { wave: 'voxa', cutoff: 100, a: [0, 0, 0, 20, 127, 127, 127] }, { structure: 'ring', structureDepth: 50, t2: { wave: 'square', coarse: -5 } }),
  // ---------------------------------------------------------------- HIT / STAB
  P('ORCH HIT', 'HIT', { wave: 'brass', cutoff: 100, a: [0, 55, 0, 30, 127, 0, 0], p: [0, 10, 0, 0, -6, 0, 0, 0, 0], penvDepth: 2 }, { t2: { wave: 'strings', coarse: 12, level: 90, a: [0, 50, 0, 30, 127, 0, 0] } }),
  P('RAVE STAB', 'HIT', { wave: 'organ3', cutoff: 90, resonance: 30, a: [0, 45, 0, 25, 127, 0, 0] }, { t2: { wave: 'supersaw', coarse: 12, level: 80, a: [0, 45, 0, 25, 127, 0, 0] } }),
  P('CHORD STAB', 'HIT', { wave: 'saw', cutoff: 70, resonance: 40, fenvDepth: 25, f: [0, 35, 0, 25, 0, 127, 10, 10, 0], a: [0, 50, 0, 30, 127, 0, 0] }, { t2: { wave: 'square', coarse: 12, fine: 6, level: 70, cutoff: 70, a: [0, 50, 0, 30, 127, 0, 0] } }),
  P('DUB STAB', 'HIT', { wave: 'saw', cutoff: 65, resonance: 60, fenvDepth: 25, f: [0, 35, 0, 25, 0, 127, 10, 10, 0], a: [0, 45, 0, 40, 127, 0, 0] }, { t2: { wave: 'saw', coarse: 7, fine: 4, cutoff: 65, resonance: 60, fenvDepth: 25, f: [0, 35, 0, 25, 0, 127, 10, 10, 0], a: [0, 45, 0, 40, 127, 0, 0] } }),
  P('HOUSE CHORD', 'HIT', { wave: 'saw', cutoff: 75, resonance: 25, a: [0, 50, 0, 25, 127, 30, 0] }, { t2: { wave: 'pulse', waveParam: 30, coarse: 12, cutoff: 75, level: 70, a: [0, 50, 0, 25, 127, 30, 0] } }),
  P('BRASS HIT', 'HIT', { wave: 'brass', cutoff: 75, fenvDepth: 30, f: [0, 30, 0, 20, 0, 127, 0, 0, 0], a: [0, 50, 0, 20, 127, 0, 0] }, { t2: { wave: 'brass', coarse: -12, fine: 5, level: 90, a: [0, 50, 0, 20, 127, 0, 0] } }),
  // ---------------------------------------------------------------- SEQ
  P('SEQ SAW', 'SEQ', { wave: 'saw', cutoff: 55, resonance: 55, fenvDepth: 28, f: [0, 28, 0, 15, 0, 127, 0, 0, 0], a: [0, 40, 0, 12, 127, 30, 0] }),
  P('SEQ SQUARE', 'SEQ', { wave: 'square', cutoff: 60, resonance: 45, fenvDepth: 25, f: [0, 25, 0, 15, 0, 127, 0, 0, 0], a: [0, 35, 0, 12, 127, 20, 0] }),
  P('SEQ FM', 'SEQ', { wave: 'fmwood', waveParam: 90, filterType: 'off', a: [0, 40, 0, 15, 127, 0, 0] }),
  P('SEQ BLIP', 'SEQ', { wave: 'sine', filterType: 'off', a: [0, 25, 0, 10, 127, 0, 0], p: [0, 12, 0, 0, 30, 0, 0, 0, 0], penvDepth: 12 }),
  P('SEQ DIGI', 'SEQ', { wave: 'digi3', cutoff: 70, resonance: 50, fenvDepth: 25, f: [0, 25, 0, 15, 0, 127, 0, 0, 0], a: [0, 35, 0, 12, 127, 20, 0] }),
  P('SEQ RESO', 'SEQ', { wave: 'pulse', waveParam: 20, cutoff: 45, resonance: 100, fenvDepth: 32, f: [0, 30, 0, 15, 0, 127, 0, 0, 0], a: [0, 40, 0, 12, 127, 30, 0] }),
  P('ARP BLEEP', 'SEQ', { wave: 'square', cutoff: 90, a: [0, 30, 0, 10, 127, 0, 0] }, { t2: { wave: 'sine', coarse: 12, level: 70, filterType: 'off', a: [0, 25, 0, 10, 127, 0, 0] } }),
  P('FXM SEQ', 'SEQ', { wave: 'sine', filterType: 'lpf', cutoff: 90, a: [0, 40, 0, 15, 127, 20, 0] }, { structure: 'fxm', structureDepth: 70, t2: { wave: 'saw', coarse: 12 } }),
  // ---------------------------------------------------------------- FX
  P('LASER', 'FX', { wave: 'sine', filterType: 'off', a: [0, 45, 0, 20, 127, 0, 0], p: [0, 35, 0, 0, 63, -40, -40, -40, -40], penvDepth: 12 }),
  P('NOISE SWEEP', 'FX', { wave: 'noise', filterType: 'bpf', cutoff: 40, resonance: 90, fenvDepth: 40, f: [90, 90, 0, 60, 0, 127, 0, 0, 0], a: [60, 90, 0, 60, 127, 0, 0] }),
  P('RISER', 'FX', { wave: 'supersaw', waveParam: 90, cutoff: 50, resonance: 50, fenvDepth: 35, f: [110, 0, 0, 30, 0, 127, 127, 127, 0], a: [100, 0, 0, 30, 127, 127, 127], p: [110, 0, 0, 0, -30, 20, 20, 20, 20], penvDepth: 12 }),
  P('ZAP FX', 'FX', { wave: 'square', cutoff: 100, a: [0, 25, 0, 10, 127, 0, 0], p: [0, 20, 0, 0, 63, -63, -63, -63, -63], penvDepth: 12 }),
  P('SCI-FI', 'FX', { wave: 'fmmetal', waveParam: 100, cutoff: 80, resonance: 60, a: [30, 80, 0, 60, 127, 100, 100], l1: { wave: 'sh', rate: 90, pitch: 20, filter: 30 } }),
  P('WIND', 'FX', { wave: 'noise', filterType: 'bpf', cutoff: 75, resonance: 85, a: [80, 0, 0, 80, 127, 127, 127], l1: { wave: 'rnd', rate: 25, filter: 40 } }),
  P('BUBBLES', 'FX', { wave: 'sine', filterType: 'off', a: [0, 40, 0, 20, 127, 0, 0], l1: { wave: 'sh', rate: 100, pitch: 35 } }),
  P('DOWNLIFTER', 'FX', { wave: 'saw', cutoff: 100, resonance: 30, a: [0, 100, 0, 30, 127, 0, 0], p: [0, 100, 0, 0, 0, -63, -63, -63, -63], penvDepth: 12, fenvDepth: -40, f: [0, 100, 0, 0, 0, 127, 127, 127, 0] }),
  P('METAL HIT', 'FX', { wave: 'fmmetal', waveParam: 90, cutoff: 100, a: [0, 70, 0, 40, 127, 0, 0] }, { structure: 'ring+2', structureDepth: 80, t2: { wave: 'square', coarse: 5, level: 60, a: [0, 60, 0, 40, 127, 0, 0] } }),
  P('VINYL NOISE', 'FX', { wave: 'pink', filterType: 'hpf', cutoff: 70, level: 60, a: [0, 0, 0, 20, 127, 127, 127], l1: { wave: 'sh', rate: 110, amp: 40 } }),
];

export const patchCategories = () => [...new Set(PRESET_PATCHES.map((p) => p.category))];
export const findPatch = (name: string) => PRESET_PATCHES.find((p) => p.name.toLowerCase() === name.toLowerCase());
