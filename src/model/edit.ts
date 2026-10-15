// Pure event-editing operations used by the sequencer UI and the agent.

import type { NoteEv, SeqEv } from './types';
import { GROOVE_MAP } from '../presets/grooves';

export const sortEvs = <T extends { t: number }>(evs: T[]) => [...evs].sort((a, b) => a.t - b.t || ('n' in a && 'n' in b ? (a as unknown as NoteEv).n - (b as unknown as NoteEv).n : 0));

export const GRID_TICKS: Record<string, number> = {
  '1/4': 96, '1/8': 48, '1/8T': 32, '1/16': 24, '1/16T': 16, '1/32': 12, '1/64': 6,
};

const wrap = (t: number, len: number) => ((t % len) + len) % len;

/** Grid quantize note starts toward the nearest grid line. strength 0-100. */
export const quantize = (evs: SeqEv[], grid: number, strength: number, len: number, notesOnly = true): SeqEv[] =>
  sortEvs(
    evs.map((e) => {
      if (notesOnly && e.k !== 'n') return e;
      const q = Math.round(e.t / grid) * grid;
      return { ...e, t: wrap(Math.round(e.t + (q - e.t) * (strength / 100)), len) };
    }),
  );

/** Shuffle quantize: snap to grid then push every second grid step later. rate 50-75 (%). */
export const shuffleQuantize = (evs: SeqEv[], grid: number, rate: number, len: number): SeqEv[] =>
  sortEvs(
    evs.map((e) => {
      if (e.k !== 'n') return e;
      const idx = Math.round(e.t / grid);
      let t = idx * grid;
      if (idx % 2 === 1) t += Math.round(grid * 2 * ((rate - 50) / 100));
      return { ...e, t: wrap(t, len) };
    }),
  );

/** Groove quantize: snap to 16ths and apply a groove template's timing and dynamics. */
export const grooveQuantize = (evs: SeqEv[], templateId: string, strength: number, len: number): SeqEv[] => {
  const tpl = GROOVE_MAP[templateId];
  if (!tpl) return evs;
  const s = strength / 100;
  return sortEvs(
    evs.map((e) => {
      if (e.k !== 'n') return e;
      const idx = Math.round(e.t / 24);
      const k = ((idx % 16) + 16) % 16;
      const t = idx * 24 + Math.round(tpl.offsets[k] * s);
      const v = Math.max(1, Math.min(127, Math.round(e.v * (1 + (tpl.vel[k] - 1) * s))));
      return { ...e, t: wrap(t, len), v };
    }),
  );
};

export const transpose = (evs: SeqEv[], semis: number): SeqEv[] =>
  evs.map((e) => (e.k === 'n' ? { ...e, n: Math.max(0, Math.min(127, e.n + semis)) } : e));

export const scaleVelocity = (evs: SeqEv[], percent: number, offset = 0): SeqEv[] =>
  evs.map((e) => (e.k === 'n' ? { ...e, v: Math.max(1, Math.min(127, Math.round((e.v * percent) / 100 + offset))) } : e));

export const shiftTime = (evs: SeqEv[], ticks: number, len: number): SeqEv[] => sortEvs(evs.map((e) => ({ ...e, t: wrap(e.t + ticks, len) })));

export const setGate = (evs: SeqEv[], percentOrTicks: { percent?: number; ticks?: number }): SeqEv[] =>
  evs.map((e) => {
    if (e.k !== 'n') return e;
    const g = percentOrTicks.ticks ?? Math.round((e.g * (percentOrTicks.percent ?? 100)) / 100);
    return { ...e, g: Math.max(1, g) };
  });

export const eraseRange = (evs: SeqEv[], from: number, to: number, filter?: (e: SeqEv) => boolean): SeqEv[] =>
  evs.filter((e) => !(e.t >= from && e.t < to && (!filter || filter(e))));

/** Copy the events of measures [src, src+count) to start at measure dst (replacing). */
export const copyMeasures = (evs: SeqEv[], barTicks: number, src: number, count: number, dst: number, len: number): SeqEv[] => {
  const from = src * barTicks;
  const to = from + count * barTicks;
  const chunk = evs.filter((e) => e.t >= from && e.t < to);
  const dFrom = dst * barTicks;
  const dTo = dFrom + count * barTicks;
  const kept = evs.filter((e) => !(e.t >= dFrom && e.t < dTo));
  const moved = chunk.map((e) => ({ ...e, t: e.t - from + dFrom })).filter((e) => e.t < len);
  return sortEvs([...kept, ...moved]);
};

/** Change pattern length: truncate or loop existing events to fill. */
export const resizeTrack = (evs: SeqEv[], oldLen: number, newLen: number, loop: boolean): SeqEv[] => {
  if (newLen <= oldLen || !loop) return evs.filter((e) => e.t < newLen);
  const out: SeqEv[] = [];
  for (let o = 0; o < newLen; o += oldLen) for (const e of evs) if (e.t + o < newLen) out.push({ ...e, t: e.t + o });
  return sortEvs(out);
};

/** Remove exact duplicate notes (same tick and note), keeping the last. */
export const dedupe = (evs: SeqEv[]): SeqEv[] => {
  const seen = new Map<string, number>();
  evs.forEach((e, i) => {
    if (e.k === 'n') seen.set(`${e.t}:${e.n}`, i);
  });
  return evs.filter((e, i) => e.k !== 'n' || seen.get(`${e.t}:${e.n}`) === i);
};

export const insertEvents = (evs: SeqEv[], add: SeqEv[]): SeqEv[] => dedupe(sortEvs([...evs, ...add]));

export const fmtTick = (t: number, barTicks: number) => {
  const bar = Math.floor(t / barTicks) + 1;
  const inBar = t % barTicks;
  const beat = Math.floor(inBar / 96) + 1;
  const tick = inBar % 96;
  return `${String(bar).padStart(3, '0')}-${String(beat).padStart(2, '0')}-${String(tick).padStart(2, '0')}`;
};
