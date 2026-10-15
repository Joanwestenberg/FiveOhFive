import { describe, expect, it } from 'vitest';
import { PRESET_PATTERNS } from './patterns';
import { PRESET_PATCHES } from './patches';
import { PRESET_KITS } from './kits';
import { Engine } from '../engine/core';
import { patternTicks } from '../model/defaults';

describe('presets', () => {
  it('builds patterns with events inside their length', () => {
    expect(PRESET_PATTERNS.length).toBeGreaterThan(25);
    for (const p of PRESET_PATTERNS) {
      const len = patternTicks(p);
      for (const tr of p.tracks) for (const e of tr) expect(e.t, p.name).toBeLessThan(len);
      expect(p.tracks[0].length, p.name).toBeGreaterThan(0);
    }
  });
  it('has unique patch and kit names', () => {
    expect(new Set(PRESET_PATCHES.map((p) => p.name)).size).toBe(PRESET_PATCHES.length);
    expect(new Set(PRESET_KITS.map((p) => p.name)).size).toBe(PRESET_KITS.length);
  });
  it('every preset pattern renders cleanly', { timeout: 60000 }, () => {
    const L = new Float32Array(128), R = new Float32Array(128);
    for (const p of PRESET_PATTERNS) {
      const e = new Engine(44100);
      e.handle({ type: 'pattern', pattern: p, mode: 'replace' });
      e.handle({ type: 'play', countIn: false });
      let peak = 0, bad = false;
      const t0 = performance.now();
      const blocks = Math.round((44100 * 3) / 128);
      for (let b = 0; b < blocks; b++) {
        e.render(L, R, 128);
        for (let i = 0; i < 128; i++) { if (!Number.isFinite(L[i])) bad = true; peak = Math.max(peak, Math.abs(L[i])); }
      }
      const ms = performance.now() - t0;
      console.log(`${p.name.padEnd(20)} peak ${peak.toFixed(2)} cpu ${(ms / 30).toFixed(1)}%`);
      expect(bad, p.name).toBe(false);
      expect(peak, p.name).toBeGreaterThan(0.05);
    }
  });
});
