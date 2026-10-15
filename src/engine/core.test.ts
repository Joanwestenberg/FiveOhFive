import { describe, expect, it } from 'vitest';
import { Engine } from './core';
import { emptyPattern, defaultDrum, defaultPatch } from '../model/defaults';
import { WAVES } from './dsp/waves';
import { EFX_DEFS, efxDefaults } from '../model/efxDefs';
import type { DrumModel } from '../model/types';

const render = (e: Engine, seconds: number) => {
  const n = Math.round((e.sr * seconds) / 128);
  const L = new Float32Array(128), R = new Float32Array(128);
  let peak = 0, sum = 0, nan = false;
  for (let b = 0; b < n; b++) {
    e.render(L, R, 128);
    for (let i = 0; i < 128; i++) {
      if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) nan = true;
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      sum += L[i] * L[i];
    }
  }
  return { peak, rms: Math.sqrt(sum / (n * 128)), nan };
};

const testPattern = () => {
  const p = emptyPattern('T1');
  const models: DrumModel[] = ['kick', 'snare', 'clap', 'hat', 'cymbal', 'tom', 'rim', 'clave', 'cowbell', 'shaker', 'conga', 'zap', 'noise', 'tone', 'scratch', 'click'];
  p.kit = { name: 'T', category: 'T', insts: models.map((m, i) => defaultDrum(36 + i, m, m)) };
  for (let i = 0; i < 16; i++) p.tracks[0].push({ t: i * 24, k: 'n', n: 36 + i, v: 110, g: 12 });
  p.tracks[1] = [0, 96, 192, 288].map((t) => ({ t, k: 'n' as const, n: 48, v: 100, g: 48 }));
  p.parts[1].patch = defaultPatch();
  return p;
};

describe('engine', () => {
  it('renders a pattern with drums and synth without NaN', () => {
    const e = new Engine(48000);
    e.handle({ type: 'pattern', pattern: testPattern(), mode: 'replace' });
    e.handle({ type: 'play', countIn: false });
    const r = render(e, 2);
    expect(r.nan).toBe(false);
    expect(r.peak).toBeGreaterThan(0.05);
    expect(r.peak).toBeLessThanOrEqual(1);
  });

  it('every wave renders finite audio', () => {
    for (const w of WAVES) {
      const e = new Engine(48000);
      const p = testPattern();
      p.tracks[0] = [];
      p.parts[1].patch.tones[0].wave = w.id;
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'play', countIn: false });
      const r = render(e, 0.6);
      expect(r.nan, w.id).toBe(false);
      expect(r.peak, w.id).toBeGreaterThan(0.01);
    }
  });

  it('every EFX type renders finite audio', () => {
    for (const d of EFX_DEFS) {
      const e = new Engine(48000);
      const p = testPattern();
      p.parts[0].efx = true;
      p.parts[1].efx = true;
      p.fx.efx = { type: d.type, params: efxDefaults(d.type), level: 127, rev: 20, dly: 20 };
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'play', countIn: false });
      const r = render(e, 1);
      expect(r.nan, d.type).toBe(false);
      expect(r.peak, d.type).toBeGreaterThan(0.01);
    }
  });

  it('structures render', () => {
    for (const st of ['mix', 'ring', 'ring+2', 'fxm', 'sync'] as const) {
      const e = new Engine(48000);
      const p = testPattern();
      p.tracks[0] = [];
      p.parts[1].patch.structure = st;
      p.parts[1].patch.tones[1].on = true;
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'play', countIn: false });
      const r = render(e, 0.5);
      expect(r.nan, st).toBe(false);
      expect(r.peak, st).toBeGreaterThan(0.01);
    }
  });

  it('wraps and reports position', () => {
    const e = new Engine(48000);
    const p = testPattern();
    p.measures = 1;
    e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
    e.handle({ type: 'play', countIn: false });
    render(e, 2.1); // 120 bpm, 1 bar = 2 s
    const msgs = e.drain();
    expect(msgs.some((m) => m.type === 'wrap')).toBe(true);
    expect(msgs.some((m) => m.type === 'pos')).toBe(true);
  });

  it('records live notes', () => {
    const e = new Engine(48000);
    e.handle({ type: 'pattern', pattern: testPattern(), mode: 'replace' });
    e.handle({ type: 'rec', on: true, part: 1 });
    e.handle({ type: 'play', countIn: false });
    render(e, 0.25);
    e.handle({ type: 'note', part: 1, note: 60, vel: 100 });
    render(e, 0.25);
    e.handle({ type: 'note', part: 1, note: 60, vel: 0 });
    const rec = e.drain().filter((m) => m.type === 'rec');
    expect(rec.length).toBe(1);
  });

  it('arpeggiates held notes', () => {
    const e = new Engine(48000);
    const p = testPattern();
    p.tracks = p.tracks.map(() => []);
    e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
    e.handle({ type: 'arp', part: 1, settings: { on: true, hold: false, style: 'up', rate: '1/16', octaves: 2, gate: 50, accent: 50, shuffle: 0, beat: 'all', velocity: 0 } });
    e.handle({ type: 'note', part: 1, note: 60, vel: 100 });
    e.handle({ type: 'note', part: 1, note: 64, vel: 100 });
    const r = render(e, 1);
    expect(r.peak).toBeGreaterThan(0.01);
    const hits = e.drain().filter((m) => m.type === 'pos').reduce((a, m) => a + (m.type === 'pos' ? m.hits[1] : 0), 0);
    expect(hits).toBeGreaterThanOrEqual(7);
  });
});
