// Standard MIDI File import/export for patterns (96 PPQN, format 1).

import type { Pattern, SeqEv } from '../model/types';
import { NUM_PARTS } from '../model/types';
import { patternTicks } from '../model/defaults';

const vlq = (n: number) => {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
};
const str = (s: string) => [...s].map((c) => c.charCodeAt(0) & 0x7f);
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];

const chunk = (id: string, data: number[]) => [...str(id), ...u32(data.length), ...data];

export const exportSmf = (p: Pattern, loops = 1): Uint8Array<ArrayBuffer> => {
  const len = patternTicks(p);
  const tracks: number[][] = [];
  // tempo / meta track
  const mpqn = Math.round(60000000 / p.tempo);
  const den = Math.log2(p.beat[1]);
  tracks.push([
    0, 0xff, 0x03, ...vlq(p.name.length), ...str(p.name),
    0, 0xff, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255,
    0, 0xff, 0x58, 0x04, p.beat[0], den, 24, 8,
    ...vlq(len * loops), 0xff, 0x2f, 0x00,
  ]);
  for (let i = 0; i < NUM_PARTS; i++) {
    const evs = p.tracks[i];
    if (!evs.length) continue;
    const ch = (p.parts[i].midiCh - 1) & 15;
    const raw: { t: number; d: number[]; o: number }[] = [];
    for (let l = 0; l < loops; l++) {
      const off = l * len;
      for (const e of evs) {
        if (e.k === 'n') {
          raw.push({ t: off + e.t, d: [0x90 | ch, e.n, e.v], o: 1 });
          raw.push({ t: Math.min(off + e.t + e.g, len * loops), d: [0x80 | ch, e.n, 0], o: 0 });
        } else if (e.k === 'c') raw.push({ t: off + e.t, d: [0xb0 | ch, e.c, e.v], o: 1 });
        else {
          const v = e.v + 8192;
          raw.push({ t: off + e.t, d: [0xe0 | ch, v & 0x7f, (v >> 7) & 0x7f], o: 1 });
        }
      }
    }
    raw.sort((a, b) => a.t - b.t || a.o - b.o);
    const name = i === 0 ? 'RHYTHM' : `PART ${i} ${p.parts[i].patchRef}`;
    const data: number[] = [0, 0xff, 0x03, ...vlq(name.length), ...str(name)];
    let last = 0;
    for (const r of raw) {
      data.push(...vlq(r.t - last), ...r.d);
      last = r.t;
    }
    data.push(...vlq(Math.max(0, len * loops - last)), 0xff, 0x2f, 0x00);
    tracks.push(data);
  }
  const out = [...chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(96)])];
  for (const t of tracks) out.push(...chunk('MTrk', t));
  return new Uint8Array(out);
};

export interface SmfImport {
  tempo: number;
  beat: [number, number];
  tracks: SeqEv[][]; // per part
  lengthTicks: number;
}

/** Parse an SMF into per-part tracks. Channel 10 goes to the rhythm part; other channels map to parts by MIDI channel. */
export const importSmf = (buf: ArrayBuffer, parts: Pattern['parts']): SmfImport => {
  const d = new DataView(buf);
  let pos = 0;
  const rd = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 8) | d.getUint8(pos++);
    return v >>> 0;
  };
  const id = () => String.fromCharCode(rd(1), rd(1), rd(1), rd(1));
  if (id() !== 'MThd') throw new Error('Not a MIDI file');
  const hlen = rd(4);
  rd(2);
  const ntr = rd(2);
  const division = rd(2);
  pos = 8 + hlen;
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const scale = 96 / division;
  let tempo = 120;
  let beat: [number, number] = [4, 4];
  const out: SeqEv[][] = Array.from({ length: NUM_PARTS }, () => []);
  const chToPart = (ch: number) => {
    if (ch === 9) return 0;
    const k = parts.findIndex((p, i) => i > 0 && p.midiCh - 1 === ch);
    return k > 0 ? k : Math.min(7, Math.max(1, ch + 1));
  };
  let maxT = 0;
  for (let tr = 0; tr < ntr && pos < buf.byteLength; tr++) {
    if (id() !== 'MTrk') break;
    const len = rd(4);
    const end = pos + len;
    let t = 0;
    let status = 0;
    const open = new Map<string, { t: number; v: number; part: number }>();
    while (pos < end) {
      let delta = 0;
      let b: number;
      do {
        b = rd(1);
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80);
      t += delta;
      let s = d.getUint8(pos);
      if (s & 0x80) pos++;
      else s = status;
      const tt = Math.round(t * scale);
      if (s === 0xff) {
        const type = rd(1);
        let l = 0;
        do { b = rd(1); l = (l << 7) | (b & 0x7f); } while (b & 0x80);
        if (type === 0x51 && l === 3) tempo = Math.round((60000000 / ((d.getUint8(pos) << 16) | (d.getUint8(pos + 1) << 8) | d.getUint8(pos + 2))) * 10) / 10;
        if (type === 0x58 && l >= 2) beat = [d.getUint8(pos), 1 << d.getUint8(pos + 1)];
        pos += l;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) {
        let l = 0;
        do { b = rd(1); l = (l << 7) | (b & 0x7f); } while (b & 0x80);
        pos += l;
        continue;
      }
      status = s;
      const type = s & 0xf0;
      const ch = s & 15;
      const part = chToPart(ch);
      if (type === 0x90 || type === 0x80) {
        const n = rd(1);
        const v = rd(1);
        const key = `${ch}:${n}`;
        if (type === 0x90 && v > 0) open.set(key, { t: tt, v, part });
        else {
          const o = open.get(key);
          if (o) {
            out[o.part].push({ t: o.t, k: 'n', n, v: o.v, g: Math.max(1, tt - o.t) });
            open.delete(key);
            maxT = Math.max(maxT, tt);
          }
        }
      } else if (type === 0xb0) {
        const c = rd(1);
        const v = rd(1);
        out[part].push({ t: tt, k: 'c', c, v });
      } else if (type === 0xe0) {
        const lo = rd(1);
        const hi = rd(1);
        out[part].push({ t: tt, k: 'b', v: ((hi << 7) | lo) - 8192 });
      } else if (type === 0xc0 || type === 0xd0) rd(1);
      else if (type === 0xa0) rd(2);
      else break;
    }
    pos = end;
  }
  for (const tr of out) tr.sort((a, b) => a.t - b.t);
  return { tempo, beat, tracks: out, lengthTicks: maxT };
};
