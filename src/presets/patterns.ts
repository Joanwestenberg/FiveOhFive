// Preset patterns. Each is written in the compact step notation from model/notation.ts.

import type { EfxType, FxSetup, Groove, Pattern, SeqEv } from '../model/types';
import { NUM_PARTS } from '../model/types';
import { clone, defaultPart, emptyPattern, patternTicks } from '../model/defaults';
import { efxDefaults } from '../model/efxDefs';
import { loopTo, parseDrums, parseSteps } from '../model/notation';
import { findPatch } from './patches';
import { findKit, PRESET_KITS } from './kits';

interface PartSpec {
  patch?: string;
  notes?: string; // step notation, looped to fill the pattern
  step?: number; // ticks per step (default 24)
  gate?: number;
  level?: number;
  pan?: number;
  rev?: number;
  dly?: number;
  efx?: boolean;
  key?: number;
}

interface PatSpec {
  name: string;
  genre: string;
  tempo: number;
  measures?: number;
  kit: string;
  drums: Record<number, string>;
  drumLevel?: number;
  drumEfx?: boolean;
  parts?: Record<number, PartSpec>;
  efx?: { type: EfxType; params?: Record<string, number>; rev?: number; dly?: number };
  reverb?: Partial<FxSetup['reverb']>;
  delay?: Partial<FxSetup['delay']>;
  groove?: Partial<Groove>;
}

const build = (id: string, s: PatSpec): Pattern => {
  const p = emptyPattern(id, s.name);
  p.genre = s.genre;
  p.tempo = s.tempo;
  p.measures = s.measures ?? 2;
  const total = patternTicks(p);
  const kit = findKit(s.kit) ?? PRESET_KITS[0];
  p.kit = clone(kit);
  p.kitRef = kit.name;
  p.parts[0].level = s.drumLevel ?? 105;
  p.parts[0].efx = !!s.drumEfx;
  p.tracks[0] = parseDrums(s.drums, total / 24);
  for (const [k, ps] of Object.entries(s.parts ?? {})) {
    const i = +k;
    const preset = ps.patch ? findPatch(ps.patch) : undefined;
    if (ps.patch && !preset) throw new Error(`Unknown patch ${ps.patch} in ${s.name}`);
    const part = defaultPart(i, preset ? clone(preset) : undefined);
    part.patchRef = preset?.name ?? 'INIT';
    if (ps.level !== undefined) part.level = ps.level;
    if (ps.pan !== undefined) part.pan = ps.pan;
    if (ps.rev !== undefined) part.rev = ps.rev;
    if (ps.dly !== undefined) part.dly = ps.dly;
    if (ps.key !== undefined) part.key = ps.key;
    part.efx = !!ps.efx;
    p.parts[i] = part;
    if (ps.notes) {
      const evs = parseSteps(ps.notes, { step: ps.step ?? 24, gate: ps.gate });
      const len = Math.max(...evs.map((e) => e.t + 1), 0);
      // phrase length = number of steps written, rounded up to a whole bar
      const steps = ps.notes.split(/\s+/).filter((t) => t && t !== '|').reduce((a, t) => a + (/~(\d+)/.exec(t) ? +/~(\d+)/.exec(t)![1] : 1), 0);
      const phrase = Math.max(len, Math.ceil((steps * (ps.step ?? 24)) / 384) * 384);
      p.tracks[i] = loopTo(evs, phrase, total) as SeqEv[];
    }
  }
  if (s.efx) p.fx.efx = { type: s.efx.type, params: { ...efxDefaults(s.efx.type), ...(s.efx.params ?? {}) }, level: 127, rev: s.efx.rev ?? 0, dly: s.efx.dly ?? 0 };
  if (s.reverb) p.fx.reverb = { ...p.fx.reverb, ...s.reverb };
  if (s.delay) p.fx.delay = { ...p.fx.delay, ...s.delay };
  if (s.groove) p.groove = { ...p.groove, ...s.groove };
  for (let i = 0; i < NUM_PARTS; i++) p.tracks[i].sort((a, b) => a.t - b.t);
  return p;
};

const FOUR = 'X...X...X...X...';
const CLAP24 = '....X.......X...';
const OFFHAT = '..x...x...x...x.';
const HATS16 = 'x.o.x.o.x.o.x.o.';

const SPECS: PatSpec[] = [
  // ----------------------------------------------------------------- ACID / HOUSE
  {
    name: 'ACID TRAX', genre: 'ACID', tempo: 126, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT, 42: 'x.x.x.x.x.x.x.x.' },
    parts: {
      1: { patch: 'ACID LINE', dly: 25, notes: 'C2 C2! C3^ C2 . D#2 C2! . F2^ F#2 C2 C3! . C2 A#1^ C2 | C2 . C3^ C2! D#2 . C2 F2! . C2^ C3 C2 . G1 A#1 C2!' },
    },
    delay: { sync: '1/8D', feedback: 45 },
  },
  {
    name: 'ACID WAREHOUSE', genre: 'ACID', tempo: 132, kit: 'TECHNO KIT',
    drums: { 36: FOUR, 38: '....x.......x..o', 42: HATS16, 46: OFFHAT, 37: '.......x.....x..' },
    parts: {
      1: { patch: 'ACID SCREAM', efx: true, notes: 'A1 A1 A2^ A1 G1! A1 . A1 C2^ D2 A1 A2! . G1 A1^ E2 | A1 . A1! A2^ A1 . G2 A1 . C2! A1 A1^ G1 . A1 E1' },
      2: { patch: 'SEQ BLIP', level: 70, dly: 50, notes: 'E5 . . . . . . . . . E5 . . . . . | . . . . A5 . . . . . . . . . . .' },
    },
    efx: { type: 'distortion', params: { drive: 60, tone: 80, level: 75 } },
  },
  {
    name: 'DEEP HOUSE', genre: 'HOUSE', tempo: 122, kit: 'HOUSE KIT',
    drums: { 36: FOUR, 39: CLAP24, 42: '..x...x...x...xo', 46: '..x.......x.....', 70: 'oxoxoxoxoxoxoxox' },
    groove: { type: 'swing58', strength: 70 },
    parts: {
      1: { patch: 'DUB BASS', notes: 'A1~2 . . . A1 . C2~2 . . A1 . G1~2 . . | D2~2 . . . D2 . F2~2 . . D2 . C2~2 . .' },
      2: { patch: 'HOUSE CHORD', rev: 50, dly: 30, level: 85, notes: '. . . A2+C3+E3+G3~2 . . A2+C3+E3+G3 . . . . . A2+C3+E3+G3~2 . . | . . . D3+F3+A3+C4~2 . . D3+F3+A3+C4 . . . . . D3+F3+A3+C4~2 . .' },
      3: { patch: 'E.PIANO', level: 70, rev: 60, notes: '. . . . . . . . E4 . . . . . . . | . . . . . . . . F4 . . . . . . .' },
    },
    reverb: { type: 'hall1', time: 80, level: 85 },
  },
  {
    name: 'CHICAGO JACK', genre: 'HOUSE', tempo: 125, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 39: CLAP24, 38: '....X.......X...', 46: OFFHAT, 42: 'xxxxxxxxxxxxxxxx' },
    parts: {
      1: { patch: 'HOUSE ORG BASS', notes: 'C2 . C2 C3 . C2 . A#1 . C2 . C2 D#2 . C2 G1' },
      2: { patch: 'HOUSE PIANO', rev: 40, notes: '. . C4+D#4+G4 . . . C4+D#4+G4 . . . C4+D#4+G4 . . . . . | . . A#3+D4+F4 . . . A#3+D4+F4 . . . A#3+D4+F4 . . A#3+D4+F4 . .' },
    },
  },
  {
    name: 'GARAGE SWING', genre: 'GARAGE', tempo: 132, kit: 'HOUSE KIT',
    drums: { 36: 'X.....x...X.....', 38: '....X.......X...', 39: '....x.......x...', 42: 'x.x.x.x.x.x.x.xo', 70: '..x...x...x...x.' },
    groove: { type: 'shuffle', strength: 65 },
    parts: {
      1: { patch: 'SUB BASS', notes: 'F1~2 . F1 . . G#1~2 . . F1 . . D#1~2 . . | C2~2 . C2 . . D#2~2 . . C2 . . A#1~2 . .' },
      2: { patch: 'HOUSE ORGAN', rev: 40, notes: '. . F3+G#3+C4 . . . . . . . F3+G#3+C4 . . . . . | . . D#3+G3+A#3 . . . . . . . D#3+G3+A#3 . . . . .' },
    },
  },
  {
    name: 'DISCO NIGHTS', genre: 'DISCO', tempo: 120, kit: 'HOUSE KIT',
    drums: { 36: FOUR, 38: CLAP24, 46: OFFHAT, 42: 'x.x.x.x.x.x.x.x.', 54: 'x.x.x.x.x.x.x.x.' },
    parts: {
      1: { patch: 'ANALOG BASS', notes: 'G1 G2 G1 G2 G1 G2 G1 G2 C2 C3 C2 C3 C2 C3 C2 C3 | A1 A2 A1 A2 A1 A2 A1 A2 D2 D3 D2 D3 D2 D3 D2 D3' },
      2: { patch: 'STRING MACHINE', rev: 50, level: 85, notes: 'G3+B3+D4~8 . C4+E4+G4~8 | A3+C4+E4~8 . D4+F#4+A4~8' },
      3: { patch: 'CLAVI', level: 80, notes: '. G4 . G4 . . G4 . . G4 . G4 . . G4 .' },
    },
  },
  // ----------------------------------------------------------------- TECHNO
  {
    name: 'DETROIT STRINGS', genre: 'TECHNO', tempo: 130, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 38: '....x.......x...', 42: 'x.xxx.xxx.xxx.xx', 46: OFFHAT, 51: 'x.x.x.x.x.x.x.x.' },
    parts: {
      1: { patch: 'SEQ SAW', dly: 40, notes: 'F2 . F3 . F2 G#2 . F2 C3 . F2 . D#3 . F2 C3' },
      2: { patch: 'STRING MACHINE', rev: 70, level: 80, notes: 'F3+G#3+C4~16 | D#3+G3+A#3~16' },
      3: { patch: 'SUB BASS', level: 90, notes: 'F1~2 . . F1~2 . . F1~2 . . F1~2 . . . .' },
    },
    delay: { sync: '1/8D', feedback: 55 },
  },
  {
    name: 'MINIMAL TOOL', genre: 'TECHNO', tempo: 128, kit: 'TECHNO KIT',
    drums: { 36: FOUR, 37: '..x..x....x..x..', 42: '..x...x...x...x.', 39: '............x...', 46: '......x.........' },
    parts: {
      1: { patch: 'FM BASS', efx: true, notes: 'D2 . . D2 . . . D3 . D2 . . F2 . . .' },
      2: { patch: 'SEQ BLIP', dly: 60, level: 65, notes: '. . . . . . A5 . . . . . . . . . | . . . . . . . . . . . . D6 . . .' },
    },
    efx: { type: 'stepFilter', params: { resonance: 90, depth: 110 } },
  },
  {
    name: 'WAREHOUSE STAB', genre: 'TECHNO', tempo: 138, kit: 'INDUSTRIAL KIT',
    drums: { 36: FOUR, 39: '....x.......x...', 42: 'xxxxxxxxxxxxxxxx', 46: OFFHAT, 37: '...x......x...x.' },
    parts: {
      1: { patch: 'RAVE STAB', rev: 40, dly: 30, notes: '. . C3+D#3+G3 . . . . C3+D#3+G3 . . C3+D#3+G3 . . . . .' },
      2: { patch: 'REESE', notes: 'C1~4 . . . C1~2 . C1~2 . D#1~4 . . . | C1~4 . . . C1~2 . G0~2 . A#0~4 . . .' },
    },
  },
  {
    name: 'DUB TECHNO', genre: 'TECHNO', tempo: 120, kit: 'BOOM KIT',
    drums: { 36: FOUR, 42: '..o...o...o...oo', 46: '..x.......x.....', 37: '.........o......' },
    parts: {
      1: { patch: 'DUB STAB', rev: 80, dly: 90, notes: '. . . C3+D#3+G3+A#3 . . . . . . . . . . C3+D#3+G3+A#3 . | . . . C3+D#3+G3+A#3 . . . . . . . . . . . .' },
      2: { patch: 'SUB BASS', notes: 'C1~2 . . . . . . . . . . C1~2 . . . .' },
      3: { patch: 'NOISE PAD', level: 50, rev: 60, notes: 'C4~32' },
    },
    delay: { sync: '1/8D', feedback: 75, hfDamp: 90, toReverb: 60 },
    reverb: { type: 'hall2', time: 100, level: 90 },
  },
  {
    name: 'HARD GROOVE', genre: 'TECHNO', tempo: 140, kit: 'TECHNO KIT',
    drums: { 36: FOUR, 38: '..o...o...o..o.o', 42: 'x.x.xxx.x.x.xxx.', 46: OFFHAT, 63: '..x..x...x..x.x.', 64: 'x....x....x.x...' },
    drumEfx: true,
    efx: { type: 'compressor', params: { threshold: 60, ratio: 80, gain: 60 } },
    parts: { 1: { patch: 'GROWL BASS', notes: 'E1 . E1 . E2 . E1 . E1 . G1 . E1 . A1 .' } },
  },
  // ----------------------------------------------------------------- TRANCE
  {
    name: 'TRANCE GATE', genre: 'TRANCE', tempo: 138, kit: 'TRANCE KIT', measures: 4,
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT, 42: 'xxxxxxxxxxxxxxxx' },
    parts: {
      1: { patch: 'ANALOG BASS', notes: '. A1 A1 A1 . A1 A1 A1 . A1 A1 A1 . A1 A1 A1 | . F1 F1 F1 . F1 F1 F1 . F1 F1 F1 . F1 F1 F1 | . C2 C2 C2 . C2 C2 C2 . C2 C2 C2 . C2 C2 C2 | . G1 G1 G1 . G1 G1 G1 . G1 G1 G1 . G1 G1 G1' },
      2: { patch: 'SUPERSAW PAD', efx: true, rev: 60, level: 90, notes: 'A3+C4+E4~16 | F3+A3+C4~16 | C4+E4+G4~16 | G3+B3+D4~16' },
    },
    efx: { type: 'slicer', params: { sync: 12, depth: 120 }, rev: 30 },
    reverb: { type: 'hall2', time: 90 },
  },
  {
    name: 'UPLIFTING PLUCK', genre: 'TRANCE', tempo: 138, kit: 'TRANCE KIT', measures: 4,
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT, 42: '..x...x...x...x.' },
    parts: {
      1: { patch: 'SUB BASS', notes: '. D2 D2 D2 . D2 D2 D2 . D2 D2 D2 . D2 D2 D2 | . A#1 A#1 A#1 . A#1 A#1 A#1 . A#1 A#1 A#1 . A#1 A#1 A#1 | . F1 F1 F1 . F1 F1 F1 . F1 F1 F1 . F1 F1 F1 | . C2 C2 C2 . C2 C2 C2 . C2 C2 C2 . C2 C2 C2' },
      2: { patch: 'TRANCE PLUCK', dly: 70, rev: 50, notes: 'D4 F4 A4 D5 A4 F4 D4 F4 A4 D5 A4 F4 D4 F4 A4 F4 | D4 F4 A#4 D5 A#4 F4 D4 F4 A#4 D5 A#4 F4 D4 F4 A#4 F4 | C4 F4 A4 C5 A4 F4 C4 F4 A4 C5 A4 F4 C4 F4 A4 F4 | C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 G4 E4 C4 E4 G4 E4' },
      3: { patch: 'SUPERSAW LEAD', rev: 60, dly: 30, level: 80, notes: 'A5~6 . G5~2 . F5~4 . E5~4 | D5~8 . F5~8 | C5~6 . D5~2 . E5~4 . F5~4 | E5~16' },
    },
    delay: { sync: '1/8D', feedback: 60 },
  },
  {
    name: 'GOA RUSH', genre: 'TRANCE', tempo: 145, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 38: '....x.......x...', 42: 'xxxxxxxxxxxxxxxx', 46: OFFHAT },
    parts: {
      1: { patch: 'ACID SOFT', notes: '. E1 E2 E1 . E1 E2 E1 . E1 E2 E1 . G1 E2 A1' },
      2: { patch: 'FXM SEQ', dly: 50, notes: 'E4 B4 G4 E5 F4 B4 G4 E5 E4 B4 G4 D5 F4 C5 A4 F5' },
      3: { patch: 'SCI-FI', level: 60, rev: 70, notes: 'E3~32' },
    },
  },
  // ----------------------------------------------------------------- D&B / JUNGLE / BREAKS
  {
    name: 'AMEN JUNGLE', genre: 'JUNGLE', tempo: 168, kit: 'JUNGLE KIT',
    drums: {
      36: 'X.X.......XX.... X.X.......X.....', 38: '....X..o.o..X..o ....X..o.o....X.', 51: 'x.x.x.x.x.x.x.x.', 46: '..............x.', 83: 'x...............',
    },
    parts: {
      1: { patch: 'REESE', notes: 'F1~6 . . . . . F1~2 . G#1~8 | D#1~6 . . . . . D#1~2 . C1~8' },
      2: { patch: 'DARK PAD', rev: 80, level: 70, notes: 'F3+G#3+C4~16 | D#3+G3+A#3~16' },
    },
  },
  {
    name: 'LIQUID ROLLER', genre: 'D&B', tempo: 174, kit: 'BREAK KIT', measures: 4,
    drums: { 36: 'X.........X.....', 38: '....X.......X...', 40: '.......o.o....o.', 42: 'x.xox.xox.xox.xo', 46: '..............x.' },
    parts: {
      1: { patch: 'SUB BASS', notes: 'A1~6 . . . . . A1~2 . E1~8 | F1~6 . . . . . F1~2 . C2~8 | D1~6 . . . . . D1~2 . A1~8 | E1~16' },
      2: { patch: 'E.PIANO', rev: 60, level: 80, notes: 'A3+C4+E4+G4~16 | F3+A3+C4+E4~16 | D3+F3+A3+C4~16 | E3+G#3+B3+D4~16' },
      3: { patch: 'VIBES', dly: 50, rev: 50, level: 60, notes: '. . . . E5 . . . . . . . C5 . . . | . . . . A4 . . . . . . . . . . . | . . . . F5 . . . . . . . E5 . . . | . . . . B4 . . . . . . . . . . .' },
    },
  },
  {
    name: 'BIG BEAT', genre: 'BIG BEAT', tempo: 112, kit: 'BREAK KIT',
    drums: { 36: 'X.....X...X.....', 38: '....X.......X.o.', 42: 'x.x.x.x.x.x.x.x.', 46: '..........x.....', 49: 'x...............' },
    drumEfx: true,
    efx: { type: 'distortion', params: { drive: 40, tone: 70, level: 85 } },
    parts: {
      1: { patch: 'ACID DIST', notes: 'E1 . E1 E2^ E1 . G1 . E1 . A1^ G1 E1 . D2 .' },
      2: { patch: 'BRASS HIT', rev: 40, notes: 'E3+G#3+B3 . . . . . . . . . . . . . . . | . . . . . . . . . . E3+G#3+B3 . . . . .' },
    },
  },
  {
    name: 'BREAKBEAT SCIENCE', genre: 'BREAKS', tempo: 132, kit: 'BREAK KIT',
    drums: { 36: 'X..X..X...X..X..', 38: '....X..o....X...', 42: 'x.xxx.xxx.xxx.xx', 46: '...........x....' },
    groove: { type: 'funk', strength: 60 },
    parts: {
      1: { patch: 'ELECTRO BASS', notes: 'G1 . G1 . . G2 . G1 . . A#1 . G1 . F1 .' },
      2: { patch: 'SWEEP PAD', rev: 70, level: 70, notes: 'G3+A#3+D4~32' },
    },
  },
  // ----------------------------------------------------------------- HIP HOP / RNB
  {
    name: 'BOOM BAP', genre: 'HIP HOP', tempo: 90, kit: 'HIPHOP KIT',
    drums: { 36: 'X.......X.X..... X......X..X.....', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.', 46: '..............o.' },
    groove: { type: 'swing62', strength: 80 },
    parts: {
      1: { patch: 'PICK BASS', notes: 'D2~3 . . . . . . D2 . F2~2 . . A1~3 . . | C2~3 . . . . . . C2 . E2~2 . . G1~3 . .' },
      2: { patch: 'WURLY', rev: 40, level: 80, notes: '. . . . D3+F3+A3+C4~4 . . . . . . . . . . . | . . . . C3+E3+G3+B3~4 . . . . . . . . . . .' },
    },
  },
  {
    name: 'LO-FI STUDY', genre: 'HIP HOP', tempo: 82, kit: 'LO-FI KIT',
    drums: { 36: 'X......xX.......', 38: '....X.......X...', 42: 'x.xox.xox.xox.xo', 37: '...........o....' },
    groove: { type: 'swing66', strength: 70 },
    parts: {
      1: { patch: 'E.PIANO', efx: true, rev: 50, notes: 'F3+A3+C4+E4~8 . . . . . . . . E3+G3+B3+D4~8 | D3+F3+A3+C4~8 . . . . . . . . G3+B3+D4+F4~8' },
      2: { patch: 'SUB BASS', notes: 'F1~6 . . . . . . E1~2 . . E1~6 | D1~6 . . . . . . G1~2 . . G1~6' },
      3: { patch: 'VINYL NOISE', level: 40, notes: 'C4~32' },
    },
    efx: { type: 'loFi', params: { bits: 70, rate: 30, tone: 70, noise: 30 } },
  },
  {
    name: 'HALF TIME 808', genre: 'TRAP', tempo: 140, kit: 'BOOM KIT', measures: 2,
    drums: { 36: 'X.........X..... X..X......X.....', 39: '........X.......', 42: 'x.x.x.xxx.x.x.x. x.x.x.x.xxxxx.x.', 46: '..............x.' },
    parts: {
      1: { patch: '808 BOOM', notes: 'F1~10 . . . . . . . . . F1~6 . . . . . | G#1~3 . . F1~7 . . . . . . D#1~6 . . . . .' },
      2: { patch: 'MUSIC BOX', rev: 60, dly: 40, level: 75, notes: 'C5 . G#4 . F4 . C5 . A#4 . G#4 . G4 . F4 . | C5 . G#4 . F4 . D#5 . C5 . A#4 . G#4 . G4 .' },
    },
  },
  {
    name: 'SLOW JAM', genre: 'R&B', tempo: 86, kit: 'HIPHOP KIT',
    drums: { 36: 'X.....X...X.....', 39: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.', 75: '..x.....x.....x.' },
    groove: { type: 'swing58', strength: 60 },
    parts: {
      1: { patch: 'SUB BASS', notes: 'C2~4 . . . . . . C2 . . A#1~4 . . . | G#1~4 . . . . . . G#1 . . G1~4 . . .' },
      2: { patch: 'TINE PIANO', rev: 50, notes: 'C3+D#3+G3+A#3~8 . A#2+D3+F3+A3~8 | G#2+C3+D#3+G3~8 . G2+B2+D3+F3~8' },
      3: { patch: 'SINE WHISTLE', rev: 60, dly: 40, level: 70, notes: '. . . . G5~4 . . . . F5~2 . D#5~6 | . . . . C5~4 . . . . D5~2 . B4~6' },
    },
  },
  // ----------------------------------------------------------------- ELECTRO / SYNTH
  {
    name: 'ELECTRO FUNK', genre: 'ELECTRO', tempo: 118, kit: 'BOOM KIT',
    drums: { 36: 'X.....X...X..X..', 38: '....X.......X...', 42: 'xxxxxxxxxxxxxxxx', 56: '..x.....x.x.....', 80: '.............x..' },
    parts: {
      1: { patch: 'ELECTRO BASS', notes: 'D2 . . D2 . . D3 . . D2 . F2 . G2 . D2' },
      2: { patch: 'SEQ SQUARE', dly: 40, level: 75, notes: '. . A4 . . . A4 . . D5 . . C5 . A4 .' },
      3: { patch: 'ROBOT VOX', level: 70, rev: 40, notes: '. . . . D4~4 . . . . . . . . . . . | . . . . . . . . F4~2 . D4~2 . . . .' },
    },
  },
  {
    name: 'ITALO DRIVE', genre: 'ELECTRO', tempo: 120, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 38: CLAP24, 42: 'x.x.x.x.x.x.x.x.', 46: OFFHAT },
    parts: {
      1: { patch: 'SEQ SAW', notes: 'A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 | F1 F2 F1 F2 F1 F2 F1 F2 G1 G2 G1 G2 G1 G2 G1 G2' },
      2: { patch: 'SYNTH BRASS', rev: 40, level: 85, notes: 'A3+C4+E4~8 . . . . . . . . A3+C4+E4~4 . . . | F3+A3+C4~8 . . . . . . . . G3+B3+D4~4 . . .' },
      3: { patch: 'SAW LEAD', dly: 40, level: 80, notes: 'E5~3 . . D5 C5~2 . B4~2 . C5~6 | A4~3 . . B4 C5~2 . D5~2 . B4~6' },
    },
  },
  {
    name: 'SYNTHWAVE NIGHT', genre: 'SYNTH', tempo: 100, kit: 'BOOM KIT',
    drums: { 36: 'X.......X.......', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    reverb: { type: 'plate', time: 95, level: 100 },
    parts: {
      1: { patch: 'ANALOG BASS', notes: 'E1 E1 E2 E1 E1 E1 E2 E1 C1 C1 C2 C1 C1 C1 C2 C1 | D1 D1 D2 D1 D1 D1 D2 D1 B0 B0 B1 B0 B0 B1 B0 B1' },
      2: { patch: 'PWM PAD', rev: 60, level: 80, notes: 'E3+G3+B3~8 C3+E3+G3~8 | D3+F#3+A3~8 B2+D3+F#3~8' },
      3: { patch: 'SAW LEAD', dly: 50, rev: 40, level: 80, notes: 'B4~4 . . . G4~2 . A4~2 . B4~4 . . . | A4~4 . . . F#4~2 . D4~2 . F#4~4 . . .' },
    },
    delay: { sync: '1/8D', feedback: 50 },
  },
  {
    name: 'EURO 135', genre: 'EURO', tempo: 135, kit: 'TRANCE KIT',
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT, 42: 'x.x.x.x.x.x.x.x.' },
    parts: {
      1: { patch: 'ANALOG BASS', notes: '. G1 . G1 . G1 . G1 . D#1 . D#1 . D#1 . D#1 | . F1 . F1 . F1 . F1 . D1 . D1 . D1 . D1' },
      2: { patch: 'HOUSE PIANO', rev: 40, notes: '. . G3+A#3+D4 . . G3+A#3+D4 . . . . G3+A#3+D#4 . . G3+A#3+D#4 . . | . . F3+A3+C4 . . F3+A3+C4 . . . . F#3+A3+D4 . . F#3+A3+D4 . .' },
      3: { patch: 'SUPERSAW LEAD', dly: 40, level: 75, notes: 'G4~2 A#4~2 D5~4 C5~2 A#4~2 A4~4 | A4~2 A#4~2 C5~4 A#4~2 A4~2 F#4~4' },
    },
  },
  // ----------------------------------------------------------------- DUB / REGGAE / FUNK
  {
    name: 'ONE DROP DUB', genre: 'DUB', tempo: 76, kit: 'RHYTHM BOX',
    drums: { 36: '........X.......', 37: '........X.......', 42: 'x.x.x.x.x.x.x.x.', 46: '..............o.' },
    groove: { type: 'reggae', strength: 70, resolution: 16 },
    parts: {
      1: { patch: 'DUB BASS', notes: 'A1~3 . . . . A1 C2 . E2~2 . D2 . C2 . A1 . | G1~3 . . . . G1 B1 . D2~2 . C2 . B1 . G1 .' },
      2: { patch: 'JAZZ ORGAN', dly: 40, rev: 40, level: 75, notes: '. . . . A3+C4+E4 . . . . . . . A3+C4+E4 . . . | . . . . G3+B3+D4 . . . . . . . G3+B3+D4 . . .' },
    },
    delay: { sync: '1/4D', feedback: 70, toReverb: 50 },
  },
  {
    name: 'FUNK MACHINE', genre: 'FUNK', tempo: 104, kit: 'BREAK KIT',
    drums: { 36: 'X.....X.X.....X.', 38: '....X..o.o..X..o', 42: 'xoxoxoxoxoxoxoxo', 46: '......x.........' },
    groove: { type: 'funk', strength: 80 },
    parts: {
      1: { patch: 'FUNK BASS', notes: 'E1! . E2 . . E1 G1 . A1 . . E1 D2 . B1 .' },
      2: { patch: 'CLAVI', level: 80, notes: '. E3+G3+B3+D4 . E3+G3+B3+D4 . . E3+G3+B3+D4 . . E3+G3+B3+D4 . E3+G3+B3+D4 . . E3+G3+B3+D4 .' },
      3: { patch: 'HORN SECTION', rev: 30, level: 75, notes: '. . . . . . . . . . . . B4!~2 . D5 . | . . . . . . . . . . . . E5!~4 . . .' },
    },
  },
  // ----------------------------------------------------------------- AMBIENT / DOWNTEMPO
  {
    name: 'AMBIENT DRIFT', genre: 'AMBIENT', tempo: 90, kit: 'PERCUSSION', measures: 4,
    drums: { 42: '..o...o...o...o.', 62: '.......o........', 75: '..........o.....' },
    drumLevel: 70,
    reverb: { type: 'hall2', time: 115, level: 110, preDelay: 40 },
    parts: {
      1: { patch: 'SPACE PAD', rev: 100, notes: 'D3+A3+E4~32 | A#2+F3+C4~32' },
      2: { patch: 'BELL', rev: 90, dly: 70, level: 70, notes: 'A5 . . . . . E5 . . . . . . . . . | . . . D6 . . . . . . . . A5 . . . | F5 . . . . . C6 . . . . . . . . . | . . . . . . . . E5 . . . . . . .' },
      3: { patch: 'SUB BASS', level: 70, notes: 'D1~32 | A#0~32' },
    },
    delay: { sync: '1/4D', feedback: 70, toReverb: 70 },
  },
  {
    name: 'TRIP HOP', genre: 'DOWNTEMPO', tempo: 92, kit: 'LO-FI KIT',
    drums: { 36: 'X......X..X.....', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.', 46: '......o.........' },
    groove: { type: 'hiphop', strength: 70 },
    parts: {
      1: { patch: 'DARK PAD', rev: 70, notes: 'C3+D#3+G3~16 | G#2+C3+D#3~16' },
      2: { patch: 'SUB BASS', notes: 'C1~6 . . . . . . C1~2 . G1~6 | G#0~6 . . . . . . G#0~2 . D#1~6' },
      3: { patch: 'VIBES', dly: 50, rev: 60, level: 70, notes: '. . . . G4 . . D#4 . . . . C5 . . . | . . . . G#4 . . D#4 . . . . C4 . . .' },
    },
  },
  {
    name: 'LATIN HOUSE', genre: 'HOUSE', tempo: 124, kit: 'HOUSE KIT',
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT, 62: '..x..x....x..x..', 63: 'x......x..x.....', 64: '....x.......x..x', 75: 'x..x..x...x.x...', 54: 'x.xxx.xxx.xxx.xx' },
    groove: { type: 'samba', strength: 50 },
    parts: {
      1: { patch: 'ANALOG BASS', notes: 'A1 . . A1 . . A2 . . A1 . . G1 . E1 .' },
      2: { patch: 'HOUSE PIANO', rev: 40, level: 85, notes: '. . A3+C4+E4 . . . . A3+C4+E4 . . G3+B3+D4 . . . . .' },
    },
  },
  {
    name: 'ARP DEMO', genre: 'DEMO', tempo: 128, kit: 'PUNCH KIT',
    drums: { 36: FOUR, 39: CLAP24, 46: OFFHAT },
    parts: {
      1: { patch: 'ARP BLEEP', dly: 50, notes: 'C4+E4+G4~16 | A3+C4+E4~16' },
      2: { patch: 'SUB BASS', notes: 'C2~16 | A1~16' },
    },
  },
];

export const PRESET_PATTERNS: Pattern[] = SPECS.map((s, i) => build(`P${String(i + 1).padStart(3, '0')}`, s));
export const presetGenres = () => [...new Set(PRESET_PATTERNS.map((p) => p.genre))];
