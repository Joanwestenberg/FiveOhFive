// Compact step notation used by the preset patterns and accepted by the agent's write tools.
//
// Melodic: whitespace-separated tokens, each one step long (a 16th by default).
//   C3        note (octave 3 = middle C is C4 in this scheme: MIDI 60 = C4)
//   Eb2 F#1   accidentals
//   C3+Eb3+G3 chord
//   ~N        suffix: lasts N steps (and advances N steps)
//   !         suffix: accent (velocity 125)        ?  suffix: soft (velocity 70)
//   ^         suffix: slide/tie into the next note (gate overlaps, mono patches glide)
//   .         rest (".~4" rests four steps)        |  bar line, ignored
// Drums: one string per key, one character per step: X accent, x normal, o ghost, . rest.

import type { NoteEv } from './types';

const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/;
const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export const parseNote = (s: string): number | null => {
  const m = NOTE_RE.exec(s.trim());
  if (!m) return null;
  let n = PC[m[1].toLowerCase()];
  if (m[2] === '#') n++;
  if (m[2] === 'b') n--;
  return n + (parseInt(m[3], 10) + 1) * 12;
};

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;

export interface ParseOpts {
  step?: number; // ticks per step (default 24 = 16th)
  start?: number; // tick offset
  gate?: number; // gate as fraction of the step length (default 0.8)
  vel?: number; // default velocity
}

export const parseSteps = (src: string, opts: ParseOpts = {}): NoteEv[] => {
  const step = opts.step ?? 24;
  const gateF = opts.gate ?? 0.8;
  const baseVel = opts.vel ?? 100;
  let t = opts.start ?? 0;
  const out: NoteEv[] = [];
  for (const raw of src.split(/\s+/)) {
    if (!raw || raw === '|') continue;
    let tok = raw;
    let len = 1;
    const lm = /~(\d+)/.exec(tok);
    if (lm) {
      len = parseInt(lm[1], 10);
      tok = tok.replace(lm[0], '');
    }
    let vel = baseVel;
    let slide = false;
    if (tok.includes('!')) vel = 125;
    if (tok.includes('?')) vel = 70;
    if (tok.includes('^')) slide = true;
    tok = tok.replace(/[!?^]/g, '');
    if (tok === '.' || tok === '-' || tok === '') {
      t += step * len;
      continue;
    }
    const notes = tok.split('+').map(parseNote);
    if (notes.some((n) => n === null)) throw new Error(`Bad note token "${raw}"`);
    const g = slide ? step * len + 8 : Math.max(1, Math.round(step * len * gateF));
    for (const n of notes) out.push({ t, k: 'n', n: n as number, v: vel, g });
    t += step * len;
  }
  return out;
};

export const parseDrums = (grid: Record<string | number, string>, totalSteps: number, step = 24): NoteEv[] => {
  const out: NoteEv[] = [];
  for (const [key, row] of Object.entries(grid)) {
    const note = /^\d+$/.test(key) ? parseInt(key, 10) : parseNote(key);
    if (note === null) throw new Error(`Bad drum key "${key}"`);
    const r = row.replace(/[\s|]/g, '');
    if (!r.length) continue;
    for (let i = 0; i < totalSteps; i++) {
      const c = r[i % r.length];
      const v = c === 'X' ? 125 : c === 'x' ? 100 : c === 'o' ? 60 : 0;
      if (v) out.push({ t: i * step, k: 'n', n: note, v, g: Math.round(step / 2) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
};

/** Repeat events written for `len` ticks until `total` ticks are filled. */
export const loopTo = (evs: NoteEv[], len: number, total: number): NoteEv[] => {
  const out: NoteEv[] = [];
  for (let o = 0; o < total; o += len) for (const e of evs) if (e.t + o < total) out.push({ ...e, t: e.t + o });
  return out;
};
