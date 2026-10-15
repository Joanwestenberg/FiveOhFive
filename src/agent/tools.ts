// Tools the assistant can call. Each tool validates its own input (inputs are streamed eagerly,
// so nothing is validated server-side) and edits the app through the same store actions as the UI.

import type Anthropic from '@anthropic-ai/sdk';
import type { DrumInst, EfxType, NoteEv, Patch, Pattern, SeqEv, SyncValue } from '../model/types';
import { NUM_PARTS } from '../model/types';
import {
  getState, edit, setIn, setPatch, setKit, setArp, play, stop, loadPattern, newPattern, savePatternAs, setLength, getPattern,
  allPatternIds, setProject, setState, getTransport,
} from '../store/store';
import { PRESET_PATCHES } from '../presets/patches';
import { PRESET_KITS } from '../presets/kits';
import { WAVES } from '../engine/dsp/waves';
import { EFX_DEFS, EFX_MAP, efxDefaults } from '../model/efxDefs';
import { ARP_STYLES, BEAT_PATTERNS } from '../presets/arp';
import { GROOVES } from '../presets/grooves';
import { DRUM_PARAMS, PART_PARAMS, PATCH_PATHS, validateParam } from '../model/params';
import { measureTicks, partName, patternTicks, clone } from '../model/defaults';
import { noteName, parseDrums, parseNote, parseSteps } from '../model/notation';
import { grooveQuantize, insertEvents, quantize, scaleVelocity, shiftTime, sortEvs, transpose } from '../model/edit';
import { SYNC_VALUES } from '../engine/dsp/math';

type Json = Record<string, unknown>;
export type ToolDef = Anthropic.Beta.BetaTool & { run: (input: Json) => unknown };

const fail = (msg: string): never => {
  throw new Error(msg);
};
const num = (v: unknown, name: string, min: number, max: number, def?: number): number => {
  if (v === undefined || v === null) {
    if (def !== undefined) return def;
    return fail(`${name} is required`);
  }
  const x = typeof v === 'string' ? Number(v) : (v as number);
  if (typeof x !== 'number' || !Number.isFinite(x)) return fail(`${name} must be a number`);
  return Math.max(min, Math.min(max, x));
};
const partArg = (v: unknown): number => {
  if (v === 'R' || v === 'r' || v === 'rhythm') return 0;
  const p = num(v, 'part', 0, 7);
  if (!Number.isInteger(p)) fail('part must be 0 (R) to 7');
  return p;
};
const noteArg = (v: unknown, name = 'note'): number => {
  if (typeof v === 'number') return Math.max(0, Math.min(127, Math.round(v)));
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) return Math.max(0, Math.min(127, parseInt(v, 10)));
    const n = parseNote(v);
    if (n !== null) return n;
    // drum name lookup in the current kit
    const d = getState().current.kit.insts.find((x) => x.name.toLowerCase() === v.toLowerCase());
    if (d) return d.note;
  }
  return fail(`${name} must be a note name like "C3" (C4 = middle C = 60), a MIDI number, or a drum name from the kit`);
};
const obj = (v: unknown, name: string): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : fail(`${name} must be an object`));

const STEP = 24; // ticks per 16th
const cur = () => getState().current;

const patternSummary = (p: Pattern) => ({
  id: p.id,
  name: p.name,
  genre: p.genre,
  tempo: p.tempo,
  measures: p.measures,
  time_signature: `${p.beat[0]}/${p.beat[1]}`,
  steps_per_measure: measureTicks(p) / STEP,
  total_steps: patternTicks(p) / STEP,
  groove: p.groove,
  parts: p.parts.map((pt, i) => ({
    part: i,
    name: partName(i),
    sound: i === 0 ? `kit: ${p.kit.name}` : `${pt.patch.name} (${pt.patch.category}${pt.patch.mono ? ', mono' : ''})`,
    level: pt.level, pan: pt.pan, key: pt.key, reverb: pt.rev, delay: pt.dly, efx: pt.efx, mute: pt.mute,
    notes: p.tracks[i].filter((e) => e.k === 'n').length,
    realtime: Object.fromEntries(Object.entries(pt.rt).filter(([, v]) => v !== 0)),
  })),
  kit: p.kit.insts.map((d) => `${d.note}:${d.name}`).join(', '),
  effects: {
    efx: { type: p.fx.efx.type, params: { ...efxDefaults(p.fx.efx.type), ...p.fx.efx.params }, level: p.fx.efx.level },
    reverb: p.fx.reverb,
    delay: p.fx.delay,
  },
});

export const stateSnapshot = () => {
  const s = getState();
  return {
    pattern: patternSummary(s.current),
    selected_part: s.part,
    arpeggiator: s.project.arp,
    playing: getTransport().playing,
  };
};

const eventsOut = (p: Pattern, part: number, fromM?: number, toM?: number) => {
  const bar = measureTicks(p);
  const from = fromM ? (fromM - 1) * bar : 0;
  const to = toM ? toM * bar : patternTicks(p);
  return p.tracks[part]
    .filter((e) => e.t >= from && e.t < to)
    .map((e) => {
      const step = Math.round((e.t / STEP) * 1000) / 1000;
      if (e.k === 'n') {
        const nm = part === 0 ? `${e.n}:${p.kit.insts.find((d) => d.note === e.n)?.name ?? '?'}` : noteName(e.n);
        return { step, note: nm, vel: e.v, len: Math.round((e.g / STEP) * 100) / 100 };
      }
      if (e.k === 'c') return { step, cc: e.c, value: e.v };
      return { step, bend: e.v };
    });
};

const writeTrack = (part: number, add: SeqEv[], mode: string, fromM?: number, toM?: number) => {
  const p = cur();
  const len = patternTicks(p);
  const bar = measureTicks(p);
  add = add.filter((e) => e.t >= 0 && e.t < len);
  edit((pp) => {
    let tr = pp.tracks[part];
    if (mode === 'replace') {
      if (fromM || toM) {
        const from = ((fromM ?? 1) - 1) * bar;
        const to = (toM ?? pp.measures) * bar;
        tr = tr.filter((e) => e.t < from || e.t >= to);
      } else tr = [];
    }
    return setIn(pp, ['tracks', part], insertEvents(tr, add));
  }, `agent:${Date.now()}`);
  return { ok: true, part: partName(part), written: add.length, total_on_part: cur().tracks[part].length };
};

const findPatchByName = (name: string): Patch | undefined => {
  const n = name.toLowerCase();
  return getState().project.userPatches.find((p) => p.name.toLowerCase() === n) ?? PRESET_PATCHES.find((p) => p.name.toLowerCase() === n);
};

// ------------------------------------------------------------------ tool definitions

const partProp = { description: 'Part number: 0 = rhythm part R (drums), 1-7 = synth parts.', type: 'integer', minimum: 0, maximum: 7 };

export const TOOLS: ToolDef[] = [
  {
    name: 'get_state',
    description: 'Get the current pattern: tempo, length, every part with its sound, mix and note count, the drum kit key map, effects and arpeggiator. Call this before making changes if you are unsure of the current state.',
    input_schema: { type: 'object', properties: {} },
    run: () => stateSnapshot(),
  },
  {
    name: 'get_part_notes',
    description: 'Read the events on one part. Times are in 16th-note steps from the start of the pattern (step 0 = measure 1 beat 1; 16 steps per 4/4 measure). Lengths are in steps.',
    input_schema: {
      type: 'object',
      properties: { part: partProp, from_measure: { type: 'integer', minimum: 1 }, to_measure: { type: 'integer', minimum: 1 } },
      required: ['part'],
    },
    run: (i) => {
      const part = partArg(i.part);
      return { part: partName(part), events: eventsOut(cur(), part, i.from_measure as number | undefined, i.to_measure as number | undefined) };
    },
  },
  {
    name: 'write_notes',
    description:
      'Write notes to a part as an explicit list. step = 16th-note index from the pattern start (fractions allowed, e.g. 2.667 for triplets). note = name like "C3" (C4 = middle C = MIDI 60) or MIDI number; on part 0 use drum key numbers (36 kick, 38 snare, 39 clap, 42 closed hat, 46 open hat...) or kit names. len = length in steps (default 1). mode "replace" clears the part (or only the given measure range) first; "merge" adds to what is there.',
    input_schema: {
      type: 'object',
      properties: {
        part: partProp,
        mode: { type: 'string', enum: ['replace', 'merge'] },
        from_measure: { type: 'integer', minimum: 1, description: 'With mode replace: first measure to clear.' },
        to_measure: { type: 'integer', minimum: 1, description: 'With mode replace: last measure to clear.' },
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step: { type: 'number', minimum: 0 },
              note: { type: ['string', 'integer'] },
              vel: { type: 'integer', minimum: 1, maximum: 127 },
              len: { type: 'number', minimum: 0.05 },
            },
            required: ['step', 'note'],
          },
        },
      },
      required: ['part', 'mode', 'notes'],
    },
    run: (i) => {
      const part = partArg(i.part);
      if (!Array.isArray(i.notes)) fail('notes must be an array');
      const evs: NoteEv[] = (i.notes as Json[]).map((n, k) => {
        const step = num(n.step, `notes[${k}].step`, 0, 10000);
        return { t: Math.round(step * STEP), k: 'n', n: noteArg(n.note, `notes[${k}].note`), v: Math.round(num(n.vel, 'vel', 1, 127, 100)), g: Math.max(1, Math.round(num(n.len, 'len', 0.05, 512, 1) * STEP * (part === 0 ? 0.5 : 1))) };
      });
      return writeTrack(part, evs, String(i.mode ?? 'merge'), i.from_measure as number | undefined, i.to_measure as number | undefined);
    },
  },
  {
    name: 'write_steps',
    description:
      'Write a melodic part using compact step notation: whitespace-separated tokens, each one 16th step. "C3" note, "Eb2"/"F#1" accidentals, "C3+Eb3+G3" chord, "." rest, suffix "~N" = lasts N steps (and advances N), "!" accent, "?" soft, "^" slide/tie into the next note (mono+legato patches glide). "|" bar lines are ignored. The phrase repeats to fill the pattern unless repeat=false. Example acid line: "C2 C2! C3^ C2 . D#2 C2! . F2^ F#2 C2 C3! . C2 A#1^ C2".',
    input_schema: {
      type: 'object',
      properties: {
        part: partProp,
        notation: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'merge'] },
        start_measure: { type: 'integer', minimum: 1, description: 'Measure where the phrase starts (default 1).' },
        repeat: { type: 'boolean', description: 'Loop the phrase to the end of the pattern (default true).' },
      },
      required: ['part', 'notation'],
    },
    run: (i) => {
      const part = partArg(i.part);
      if (typeof i.notation !== 'string' || !i.notation.trim()) fail('notation must be a non-empty string');
      const p = cur();
      const bar = measureTicks(p);
      const start = ((i.start_measure as number) ?? 1) - 1;
      const evs = parseSteps(i.notation as string, { start: start * bar });
      const steps = (i.notation as string).split(/\s+/).filter((t) => t && t !== '|').reduce((a, t) => a + (/~(\d+)/.exec(t) ? +/~(\d+)/.exec(t)![1] : 1), 0);
      const phrase = Math.max(STEP, Math.ceil((steps * STEP) / bar) * bar);
      const total = patternTicks(p);
      const out: SeqEv[] = [];
      if (i.repeat === false) out.push(...evs);
      else for (let o = 0; start * bar + o < total; o += phrase) for (const e of evs) if (e.t + o < total) out.push({ ...e, t: e.t + o });
      return writeTrack(part, out, String(i.mode ?? 'replace'));
    },
  },
  {
    name: 'write_drums',
    description:
      'Program the rhythm part (part 0) with a step grid per drum key. Keys are MIDI notes (or kit names): 36 kick, 38 snare, 39 clap, 37 rim, 42 closed hat, 44 pedal hat, 46 open hat, 49 crash, 51 ride, 41/45/48 toms, 56 cowbell, 62-64 congas, 70 maracas, 75 claves, 80 zap, 81 noise, 82 scratch, 83 sub hit. Each row is one character per 16th step: X accent, x normal, o ghost, . rest; rows shorter than the pattern repeat. Example: {"36":"X...X...X...X...","39":"....X.......X...","42":"x.x.x.x.x.x.x.x."}.',
    input_schema: {
      type: 'object',
      properties: {
        rows: { type: 'object', additionalProperties: { type: 'string' } },
        mode: { type: 'string', enum: ['replace', 'merge'], description: 'replace clears the whole rhythm part first (default); merge adds rows and replaces only the keys given.' },
      },
      required: ['rows'],
    },
    run: (i) => {
      const rows = obj(i.rows, 'rows');
      const p = cur();
      const grid: Record<number, string> = {};
      for (const [k, v] of Object.entries(rows)) {
        if (typeof v !== 'string') fail(`row ${k} must be a string`);
        const note = noteArg(/^\d+$/.test(k) ? Number(k) : k, `row key ${k}`);
        if (!/^[Xxo.\s|]*$/.test(v as string)) fail(`row ${k} may only contain X x o . characters`);
        grid[note] = v as string;
      }
      const evs = parseDrums(grid, patternTicks(p) / STEP);
      const missing = Object.keys(grid).map(Number).filter((n) => !p.kit.insts.some((d) => d.note === n));
      if ((i.mode ?? 'replace') === 'merge') {
        const keys = new Set(Object.keys(grid).map(Number));
        edit((pp) => setIn(pp, ['tracks', 0], insertEvents(pp.tracks[0].filter((e) => !(e.k === 'n' && keys.has(e.n))), evs)), `agent:${Date.now()}`);
        return { ok: true, written: evs.length, missing_in_kit: missing };
      }
      return { ...writeTrack(0, evs, 'replace'), missing_in_kit: missing };
    },
  },
  {
    name: 'clear_part',
    description: 'Delete all events on a part, optionally only within a measure range.',
    input_schema: { type: 'object', properties: { part: partProp, from_measure: { type: 'integer', minimum: 1 }, to_measure: { type: 'integer', minimum: 1 } }, required: ['part'] },
    run: (i) => writeTrack(partArg(i.part), [], 'replace', i.from_measure as number | undefined, i.to_measure as number | undefined),
  },
  {
    name: 'transform_part',
    description: 'Edit the existing notes of a part. op: "transpose" (amount = semitones), "quantize" (amount = grid in steps, e.g. 1 = 16ths, 2 = 8ths; strength 0-100), "velocity" (amount = percent, e.g. 80), "shift" (amount = steps, may be negative or fractional), "groove" (template id from list_sounds grooves; strength 0-100), "humanize" (amount = max timing jitter in ticks, also varies velocity).',
    input_schema: {
      type: 'object',
      properties: { part: partProp, op: { type: 'string', enum: ['transpose', 'quantize', 'velocity', 'shift', 'groove', 'humanize'] }, amount: { type: 'number' }, template: { type: 'string' }, strength: { type: 'number' } },
      required: ['part', 'op'],
    },
    run: (i) => {
      const part = partArg(i.part);
      const p = cur();
      const len = patternTicks(p);
      const tr = p.tracks[part];
      let out: SeqEv[];
      switch (i.op) {
        case 'transpose': out = transpose(tr, Math.round(num(i.amount, 'amount', -48, 48))); break;
        case 'quantize': out = quantize(tr, Math.max(1, Math.round(num(i.amount, 'amount', 0.125, 16, 1) * STEP)), num(i.strength, 'strength', 0, 100, 100), len); break;
        case 'velocity': out = scaleVelocity(tr, num(i.amount, 'amount', 1, 400)); break;
        case 'shift': out = shiftTime(tr, Math.round(num(i.amount, 'amount', -1024, 1024) * STEP), len); break;
        case 'groove': out = grooveQuantize(tr, String(i.template ?? 'swing58'), num(i.strength, 'strength', 0, 100, 80), len); break;
        case 'humanize': {
          const j = num(i.amount, 'amount', 0, 24, 4);
          out = sortEvs(tr.map((e) => (e.k === 'n' ? { ...e, t: (e.t + Math.round((Math.random() * 2 - 1) * j) + len) % len, v: Math.max(1, Math.min(127, e.v + Math.round((Math.random() * 2 - 1) * 10))) } : e)));
          break;
        }
        default: return fail('unknown op');
      }
      edit((pp) => setIn(pp, ['tracks', part], out), `agent:${Date.now()}`);
      return { ok: true, events: out.length };
    },
  },
  {
    name: 'set_pattern',
    description: 'Change pattern settings: tempo (20-300 BPM), measures (1-32; lengthening loops existing parts), time_signature like "4/4", name, groove (playback swing: type = "off" or a template id, strength 0-100, resolution 8 or 16).',
    input_schema: {
      type: 'object',
      properties: {
        tempo: { type: 'number' }, measures: { type: 'integer' }, time_signature: { type: 'string' }, name: { type: 'string' },
        groove: { type: 'object', properties: { type: { type: 'string' }, strength: { type: 'number' }, resolution: { type: 'integer', enum: [8, 16] } } },
      },
    },
    run: (i) => {
      const changed: string[] = [];
      if (i.measures !== undefined || i.time_signature !== undefined) {
        const p = cur();
        let beat = p.beat;
        if (i.time_signature !== undefined) {
          const m = /^(\d+)\/(2|4|8|16)$/.exec(String(i.time_signature));
          if (!m) fail('time_signature must look like 4/4, 3/4, 6/8');
          beat = [Math.max(1, Math.min(15, +m![1])), +m![2]];
        }
        setLength(Math.round(num(i.measures, 'measures', 1, 32, p.measures)), beat, true);
        changed.push('length');
      }
      if (i.tempo !== undefined) {
        const t = num(i.tempo, 'tempo', 20, 300);
        edit((p) => ({ ...p, tempo: Math.round(t * 10) / 10 }), `agent:${Date.now()}`);
        changed.push('tempo');
      }
      if (i.name !== undefined) {
        edit((p) => ({ ...p, name: String(i.name).toUpperCase().slice(0, 16) }), `agent:${Date.now()}`);
        changed.push('name');
      }
      if (i.groove !== undefined) {
        const g = obj(i.groove, 'groove');
        const type = String(g.type ?? cur().groove.type);
        if (type !== 'off' && !GROOVES.some((x) => x.id === type)) fail(`groove type must be off or one of ${GROOVES.map((x) => x.id).join(', ')}`);
        edit((p) => ({ ...p, groove: { type, strength: num(g.strength, 'strength', 0, 100, p.groove.strength), resolution: (g.resolution === 8 ? 8 : 16) as 8 | 16 } }), `agent:${Date.now()}`);
        changed.push('groove');
      }
      return { ok: true, changed, pattern: { tempo: cur().tempo, measures: cur().measures, beat: cur().beat, groove: cur().groove } };
    },
  },
  {
    name: 'list_sounds',
    description: 'List available presets: kind = "patches" (optionally filter by category), "kits", "waves", "efx" (multi-effect types with their parameters), "patterns", "arp_styles", "grooves".',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['patches', 'kits', 'waves', 'efx', 'patterns', 'arp_styles', 'grooves'] }, category: { type: 'string' } }, required: ['kind'] },
    run: (i) => {
      switch (i.kind) {
        case 'patches': {
          const all = [...getState().project.userPatches.map((p) => ({ ...p, category: `USER/${p.category}` })), ...PRESET_PATCHES];
          const list = all.filter((p) => !i.category || p.category.toLowerCase().includes(String(i.category).toLowerCase()));
          const by: Record<string, string[]> = {};
          for (const p of list) (by[p.category] ??= []).push(p.name);
          return by;
        }
        case 'kits': return [...getState().project.userKits, ...PRESET_KITS].map((k) => `${k.name} (${k.category})`);
        case 'waves': return WAVES.map((w) => ({ id: w.id, group: w.group, help: w.help }));
        case 'efx': return EFX_DEFS.map((d) => ({ type: d.type, help: d.help, params: d.params.map((p) => (p.options ? `${p.key}: ${p.options.map((o, k) => `${k}=${o}`).join(' ')}` : `${p.key} ${p.min}..${p.max} (default ${p.def})`)) }));
        case 'patterns': return allPatternIds().map((id) => { const p = getPattern(id)!; return `${id} ${p.name} [${p.genre}, ${p.tempo} BPM]`; });
        case 'arp_styles': return { styles: ARP_STYLES.map((s) => `${s.id}: ${s.help}`), beat_patterns: BEAT_PATTERNS.map((b) => `${b.id}: ${b.help}`) };
        case 'grooves': return GROOVES.map((g) => `${g.id}: ${g.help}`);
      }
      return fail('unknown kind');
    },
  },
  {
    name: 'load_patch',
    description: 'Load a preset or user patch (by name, see list_sounds patches) into synth part 1-7.',
    input_schema: { type: 'object', properties: { part: { type: 'integer', minimum: 1, maximum: 7 }, name: { type: 'string' } }, required: ['part', 'name'] },
    run: (i) => {
      const part = partArg(i.part);
      if (part === 0) fail('part 0 is the rhythm part; use load_kit');
      const p = findPatchByName(String(i.name));
      if (!p) fail(`no patch named "${i.name}". Use list_sounds with kind "patches".`);
      setPatch(part, p!, p!.name);
      return { ok: true, part, patch: p!.name };
    },
  },
  {
    name: 'get_patch',
    description: 'Get the full patch of a synth part as JSON: patch-level settings and both tones (wave, pitch, pitch envelope, filter, filter envelope, amp envelope, LFOs).',
    input_schema: { type: 'object', properties: { part: { type: 'integer', minimum: 1, maximum: 7 } }, required: ['part'] },
    run: (i) => {
      const part = partArg(i.part);
      if (part === 0) fail('part 0 is the rhythm part; use get_state for the kit');
      return cur().parts[part].patch;
    },
  },
  {
    name: 'set_patch_params',
    description:
      'Tweak the sound of synth part 1-7. params maps a path to a value. Patch-level paths: structure (mix|ring|ring+2|fxm|sync), structureDepth, level, pan, mono, legato, portamento, portaTime, bendRange, analogFeel, octave. Tone paths are prefixed tone1. or tone2.: on, wave, waveParam, coarse, fine, randomPitch, pitchKeyFollow, drive, filterType (off|lpf|lpf24|bpf|hpf|pkg), cutoff, resonance, cutoffKeyFollow, fenvDepth (-63..63), fenvVelSens, level, pan, velSens, penvDepth (-12..12 semitones), penvVelSens; envelopes aenv.t1..t4 l1..l3, fenv.t1..t4 l0..l4, penv.t1..t4 l0..l4 (pitch levels -63..63); LFOs lfo1./lfo2. wave (tri|sin|saw|sqr|trp|sh|rnd|chs), rate, sync (off|1/1|1/2|1/4|1/8|1/8T|1/16...), delay, fade, keySync, pitch, filter, amp, pan. Most values are 0-127. Example: {"tone1.cutoff": 40, "tone1.resonance": 110, "tone1.fenvDepth": 35}.',
    input_schema: { type: 'object', properties: { part: { type: 'integer', minimum: 1, maximum: 7 }, params: { type: 'object' }, name: { type: 'string', description: 'Optional new patch name.' } }, required: ['part', 'params'] },
    run: (i) => {
      const part = partArg(i.part);
      if (part === 0) fail('part 0 is the rhythm part; use set_drum');
      const params = obj(i.params, 'params');
      const errors: string[] = [];
      const applied: Record<string, unknown> = {};
      let patch: Patch = clone(cur().parts[part].patch);
      for (const [path, v] of Object.entries(params)) {
        const d = PATCH_PATHS[path];
        if (!d) { errors.push(`unknown path "${path}"`); continue; }
        try {
          const val = validateParam(d, v);
          const segs = path.split('.');
          const real = segs[0].startsWith('tone') ? ['tones', Number(segs[0].slice(4)) - 1, ...segs.slice(1)] : segs;
          patch = setIn(patch, real, val);
          applied[path] = val;
        } catch (e) {
          errors.push(String((e as Error).message));
        }
      }
      if (i.name) patch.name = String(i.name).toUpperCase().slice(0, 16);
      edit((p) => setIn(p, ['parts', part, 'patch'], patch), `agentpatch${part}`);
      return { ok: errors.length === 0, applied, errors };
    },
  },
  {
    name: 'load_kit',
    description: 'Load a rhythm set (drum kit) by name into the rhythm part. See list_sounds kits.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    run: (i) => {
      const n = String(i.name).toLowerCase();
      const k = getState().project.userKits.find((x) => x.name.toLowerCase() === n) ?? PRESET_KITS.find((x) => x.name.toLowerCase() === n);
      if (!k) fail(`no kit named "${i.name}". Use list_sounds kits.`);
      setKit(k!, k!.name);
      return { ok: true, kit: k!.name, keys: k!.insts.map((d) => `${d.note}:${d.name}`).join(', ') };
    },
  },
  {
    name: 'set_drum',
    description: 'Tweak one drum instrument in the current kit (or create it if the key is empty). Params: model (kick|snare|clap|hat|cymbal|tom|rim|clave|cowbell|shaker|conga|zap|noise|tone|scratch|click), name, tune (-24..24), decay, tone, snap, drive, level, pan (-64..63), rev, dly, choke (0-8), velSens, wave (for model tone). Kick: tone = pitch sweep amount, snap = click. Snare: snap = snappy noise. Hat: tone = brightness, snap = noise mix.',
    input_schema: { type: 'object', properties: { note: { type: ['integer', 'string'] }, params: { type: 'object' } }, required: ['note', 'params'] },
    run: (i) => {
      const note = noteArg(i.note);
      const params = obj(i.params, 'params');
      const dp = Object.fromEntries(DRUM_PARAMS.map((d) => [d.key, d]));
      const patch: Partial<DrumInst> = {};
      const errors: string[] = [];
      for (const [k, v] of Object.entries(params)) {
        if (k === 'name') { patch.name = String(v).toUpperCase().slice(0, 12); continue; }
        const d = dp[k];
        if (!d) { errors.push(`unknown drum param "${k}"`); continue; }
        try { (patch as Record<string, unknown>)[k] = validateParam(d, v); } catch (e) { errors.push((e as Error).message); }
      }
      edit((p) => {
        const exists = p.kit.insts.some((d) => d.note === note);
        const insts = exists ? p.kit.insts.map((d) => (d.note === note ? { ...d, ...patch } : d)) : [...p.kit.insts, { note, name: patch.name ?? `NOTE ${note}`, model: patch.model ?? 'tone', tune: 0, decay: 64, tone: 64, snap: 64, drive: 0, level: 110, pan: 0, rev: 0, dly: 0, choke: 0, velSens: 80, ...patch } as DrumInst];
        return { ...p, kit: { ...p.kit, insts } };
      }, `agentdrum${note}`);
      return { ok: errors.length === 0, note, errors };
    },
  },
  {
    name: 'set_mixer',
    description: 'Set part mix and realtime settings. Fields: level (0-127), pan (-64..63), key (semitone transpose -48..48), rev, dly (sends 0-127), efx (route through the multi-effect), mute, and realtime offsets rt.cutoff, rt.resonance, rt.envDepth, rt.attack, rt.decay, rt.release, rt.lfoRate, rt.lfoDepth, rt.pitch (-63..63).',
    input_schema: { type: 'object', properties: { part: partProp, settings: { type: 'object' } }, required: ['part', 'settings'] },
    run: (i) => {
      const part = partArg(i.part);
      const settings = obj(i.settings, 'settings');
      const pp = Object.fromEntries(PART_PARAMS.map((d) => [d.key, d]));
      const errors: string[] = [];
      let setup = cur().parts[part];
      for (const [k, v] of Object.entries(settings)) {
        const d = pp[k];
        if (!d) { errors.push(`unknown setting "${k}"`); continue; }
        try { setup = setIn(setup, k.split('.'), validateParam(d, v)); } catch (e) { errors.push((e as Error).message); }
      }
      edit((p) => setIn(p, ['parts', part], setup), `agentmix${part}`);
      return { ok: errors.length === 0, errors };
    },
  },
  {
    name: 'set_effects',
    description: 'Configure the shared effects. efx: {type, params, level, rev, dly} (see list_sounds efx for types and params; changing type resets params to defaults first). reverb: {type: room1|room2|stage|hall1|hall2|plate|delay|panDelay, time, hfDamp, preDelay, level}. delay: {type: mono|stereo|pingpong, sync: note value like 1/8D or off, timeMs, feedback, hfDamp, level, toReverb}. Parts only go through the EFX when their efx mix setting is on.',
    input_schema: { type: 'object', properties: { efx: { type: 'object' }, reverb: { type: 'object' }, delay: { type: 'object' } } },
    run: (i) => {
      const errors: string[] = [];
      edit((p) => {
        let fx = p.fx;
        if (i.efx) {
          const e = obj(i.efx, 'efx');
          let efx = { ...fx.efx };
          if (e.type !== undefined) {
            if (!EFX_MAP[e.type as EfxType]) errors.push(`unknown efx type ${e.type}`);
            else if (e.type !== efx.type) efx = { ...efx, type: e.type as EfxType, params: efxDefaults(e.type as EfxType) };
          }
          if (e.params) {
            const def = EFX_MAP[efx.type];
            for (const [k, v] of Object.entries(obj(e.params, 'efx.params'))) {
              const pd = def.params.find((q) => q.key === k);
              if (!pd) { errors.push(`efx ${efx.type} has no param ${k}`); continue; }
              const x = pd.options && typeof v === 'string' ? pd.options.indexOf(v) : Number(v);
              if (!Number.isFinite(x) || x < 0 && pd.min >= 0) { errors.push(`bad value for ${k}`); continue; }
              efx.params = { ...efx.params, [k]: Math.max(pd.min, Math.min(pd.max, Math.round(x))) };
            }
          }
          for (const k of ['level', 'rev', 'dly'] as const) if (e[k] !== undefined) efx[k] = Math.round(num(e[k], `efx.${k}`, 0, 127));
          fx = { ...fx, efx };
        }
        if (i.reverb) {
          const r = obj(i.reverb, 'reverb');
          const rv = { ...fx.reverb };
          if (r.type !== undefined) {
            if (!['room1', 'room2', 'stage', 'hall1', 'hall2', 'plate', 'delay', 'panDelay'].includes(String(r.type))) errors.push('bad reverb type');
            else rv.type = r.type as typeof rv.type;
          }
          for (const k of ['time', 'hfDamp', 'preDelay', 'level'] as const) if (r[k] !== undefined) rv[k] = Math.round(num(r[k], `reverb.${k}`, 0, 127));
          fx = { ...fx, reverb: rv };
        }
        if (i.delay) {
          const d = obj(i.delay, 'delay');
          const dl = { ...fx.delay };
          if (d.type !== undefined) {
            if (!['mono', 'stereo', 'pingpong'].includes(String(d.type))) errors.push('bad delay type');
            else dl.type = d.type as typeof dl.type;
          }
          if (d.sync !== undefined) {
            if (!SYNC_VALUES.includes(d.sync as SyncValue)) errors.push(`delay sync must be one of ${SYNC_VALUES.join(', ')}`);
            else dl.sync = d.sync as SyncValue;
          }
          if (d.timeMs !== undefined) dl.timeMs = Math.round(num(d.timeMs, 'timeMs', 1, 1000));
          for (const k of ['feedback', 'hfDamp', 'level', 'toReverb'] as const) if (d[k] !== undefined) dl[k] = Math.round(num(d[k], `delay.${k}`, 0, 127));
          fx = { ...fx, delay: dl };
        }
        return { ...p, fx };
      }, `agentfx:${Date.now()}`);
      return { ok: errors.length === 0, errors, effects: patternSummary(cur()).effects };
    },
  },
  {
    name: 'set_arpeggiator',
    description: 'Configure the arpeggiator (it acts on the selected part; set part to choose which). Fields: on, hold, style (see list_sounds arp_styles), rate (1/4|1/6|1/8|1/12|1/16|1/24|1/32), octaves (-3..3), gate (1-100), accent (0-100), shuffle (0-100), beat (beat pattern id), velocity (0 = as played). While on, notes sequenced on that part drive the arpeggiator.',
    input_schema: { type: 'object', properties: { part: { type: 'integer', minimum: 1, maximum: 7 }, settings: { type: 'object' } }, required: ['settings'] },
    run: (i) => {
      const s = obj(i.settings, 'settings');
      const patch: Record<string, unknown> = {};
      if (s.on !== undefined) patch.on = !!s.on;
      if (s.hold !== undefined) patch.hold = !!s.hold;
      if (s.style !== undefined) { if (!ARP_STYLES.some((a) => a.id === s.style)) fail(`style must be one of ${ARP_STYLES.map((a) => a.id).join(', ')}`); patch.style = s.style; }
      if (s.beat !== undefined) { if (!BEAT_PATTERNS.some((a) => a.id === s.beat)) fail(`beat must be one of ${BEAT_PATTERNS.map((a) => a.id).join(', ')}`); patch.beat = s.beat; }
      if (s.rate !== undefined) { if (!['1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'].includes(String(s.rate))) fail('bad rate'); patch.rate = s.rate; }
      if (s.octaves !== undefined) patch.octaves = Math.round(num(s.octaves, 'octaves', -3, 3));
      for (const k of ['gate', 'accent', 'shuffle'] as const) if (s[k] !== undefined) patch[k] = Math.round(num(s[k], k, k === 'gate' ? 1 : 0, 100));
      if (s.velocity !== undefined) patch.velocity = Math.round(num(s.velocity, 'velocity', 0, 127));
      if (i.part !== undefined) setState({ part: partArg(i.part) });
      setArp(patch);
      return { ok: true, arpeggiator: getState().project.arp, part: getState().part };
    },
  },
  {
    name: 'transport',
    description: 'Start or stop playback so the user can hear the result.',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'stop'] } }, required: ['action'] },
    run: (i) => {
      if (i.action === 'play') void play();
      else stop();
      return { ok: true };
    },
  },
  {
    name: 'manage_pattern',
    description: 'Pattern housekeeping. action "load" (id, e.g. P003 or U001), "new" (empty user pattern keeping current sounds), "save_as" (copy to the next free user slot, optional name). Prefer "new" before writing a song from scratch so presets are not overwritten.',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['load', 'new', 'save_as'] }, id: { type: 'string' }, name: { type: 'string' } }, required: ['action'] },
    run: (i) => {
      if (i.action === 'load') {
        const id = String(i.id ?? '');
        if (!getPattern(id)) fail(`no pattern ${id}`);
        loadPattern(id, { queue: false });
      } else if (i.action === 'new') newPattern();
      else savePatternAs(undefined, i.name ? String(i.name) : undefined);
      return { ok: true, current: { id: cur().id, name: cur().name } };
    },
  },
  {
    name: 'set_song',
    description: 'Create or replace a song: an ordered list of pattern ids with repeat counts. Returns the song id; the user can play it from the SONG view.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' }, steps: { type: 'array', items: { type: 'object', properties: { pattern: { type: 'string' }, repeats: { type: 'integer', minimum: 1 } }, required: ['pattern'] } }, loop: { type: 'boolean' } },
      required: ['name', 'steps'],
    },
    run: (i) => {
      if (!Array.isArray(i.steps)) fail('steps must be an array');
      const steps = (i.steps as Json[]).map((s) => {
        const id = String(s.pattern);
        if (!getPattern(id)) fail(`no pattern ${id}`);
        return { patternId: id, repeats: Math.round(num(s.repeats, 'repeats', 1, 64, 1)) };
      });
      const name = String(i.name).toUpperCase().slice(0, 16);
      const songs = getState().project.songs;
      const existing = songs.find((s) => s.name === name);
      const id = existing?.id ?? `S${String(songs.length + 1).padStart(2, '0')}`;
      const song = { id, name, steps, loop: i.loop !== false };
      setProject({ songs: existing ? songs.map((s) => (s.id === id ? song : s)) : [...songs, song] });
      return { ok: true, id };
    },
  },
];

// Every client tool streams its input eagerly; validation happens in run().
export const API_TOOLS: Anthropic.Beta.BetaTool[] = TOOLS.map(({ run: _run, ...t }) => ({ ...t, eager_input_streaming: true }));
export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export const NUM_PARTS_HINT = NUM_PARTS;
