import { describe, expect, it } from 'vitest';
import { Engine } from './core';
import { emptyPattern, defaultDrum, defaultPatch } from '../model/defaults';
import type { DrumModel } from '../model/types';

const SR = 48000;
/** Render one hit and return its spectral centroid (Hz) from a naive DFT over 4096 samples. */
const centroidOf = (setup: (e: Engine) => void, seconds = 0.15) => {
  const e = new Engine(SR);
  const p = emptyPattern('X');
  e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
  setup(e);
  const n = Math.round((SR * seconds) / 128);
  const L = new Float32Array(128), R = new Float32Array(128);
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    e.render(L, R, 128);
    out.push(...L);
  }
  const N = 4096;
  const x = out.slice(0, N).map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))));
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k += 3) {
    let re = 0, im = 0;
    const w = (2 * Math.PI * k) / N;
    for (let i = 0; i < N; i++) {
      re += x[i] * Math.cos(w * i);
      im -= x[i] * Math.sin(w * i);
    }
    const mag = re * re + im * im;
    num += mag * ((k * SR) / N);
    den += mag;
  }
  return num / den;
};

const drum = (model: DrumModel) => centroidOf((e) => {
  const p = emptyPattern('D');
  p.kit = { name: 'k', category: 'k', insts: [defaultDrum(36, model, model)] };
  e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
  e.handle({ type: 'note', part: 0, note: 36, vel: 120 });
});

describe('spectral sanity', () => {
  it('drum models sit in sensible frequency ranges', () => {
    const kick = drum('kick');
    const tom = drum('tom');
    const snare = drum('snare');
    const hat = drum('hat');
    console.log({ kick, tom, snare, hat });
    expect(kick).toBeLessThan(tom * 1.5);
    expect(tom).toBeLessThan(snare);
    expect(snare).toBeLessThan(hat);
    expect(hat).toBeGreaterThan(4000);
  });
  it('filter cutoff darkens a saw', () => {
    const bright = centroidOf((e) => {
      const p = emptyPattern('S');
      p.parts[1].patch = defaultPatch();
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'note', part: 1, note: 48, vel: 100 });
    });
    const dark = centroidOf((e) => {
      const p = emptyPattern('S');
      const patch = defaultPatch();
      patch.tones[0].cutoff = 50;
      p.parts[1].patch = patch;
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'note', part: 1, note: 48, vel: 100 });
    });
    console.log({ bright, dark });
    expect(dark).toBeLessThan(bright * 0.5);
  });
  it('pitch follows the keyboard', () => {
    const lo = centroidOf((e) => {
      const p = emptyPattern('S');
      const patch = defaultPatch();
      patch.tones[0].wave = 'sine';
      p.parts[1].patch = patch;
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'note', part: 1, note: 57, vel: 100 });
    });
    const hi = centroidOf((e) => {
      const p = emptyPattern('S');
      const patch = defaultPatch();
      patch.tones[0].wave = 'sine';
      p.parts[1].patch = patch;
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'note', part: 1, note: 69, vel: 100 });
    });
    console.log({ lo, hi });
    expect(Math.abs(lo - 220)).toBeLessThan(40);
    expect(Math.abs(hi - 440)).toBeLessThan(60);
  });
});
