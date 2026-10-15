import type {
  AmpEnv, ArpSettings, DelaySetup, DrumInst, EfxSetup, FxSetup, Kit, Lfo, ModEnv, PartSetup, Patch,
  Pattern, Realtime, ReverbSetup, RpsSet, SystemSettings, Tone,
} from './types';
import { NUM_PARTS } from './types';

export const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export const defaultLfo = (): Lfo => ({
  wave: 'tri', rate: 80, sync: 'off', delay: 0, fade: 0, keySync: false, pitch: 0, filter: 0, amp: 0, pan: 0,
});

export const defaultAmpEnv = (): AmpEnv => ({ t1: 0, t2: 60, t3: 0, t4: 30, l1: 127, l2: 127, l3: 127 });
export const defaultPitchEnv = (): ModEnv => ({ t1: 0, t2: 0, t3: 0, t4: 0, l0: 0, l1: 0, l2: 0, l3: 0, l4: 0 });
export const defaultFilterEnv = (): ModEnv => ({ t1: 0, t2: 60, t3: 0, t4: 30, l0: 0, l1: 127, l2: 64, l3: 64, l4: 0 });

export const defaultTone = (on = true): Tone => ({
  on,
  wave: 'saw',
  waveParam: 64,
  coarse: 0,
  fine: 0,
  randomPitch: 0,
  pitchKeyFollow: 100,
  penvDepth: 0,
  penvVelSens: 0,
  penv: defaultPitchEnv(),
  drive: 0,
  filterType: 'lpf',
  cutoff: 127,
  resonance: 0,
  cutoffKeyFollow: 0,
  fenvDepth: 0,
  fenvVelSens: 0,
  fenv: defaultFilterEnv(),
  level: 110,
  pan: 0,
  velSens: 64,
  aenv: defaultAmpEnv(),
  lfo1: defaultLfo(),
  lfo2: { ...defaultLfo(), wave: 'sin', rate: 60 },
});

export const defaultPatch = (name = 'INIT PATCH'): Patch => ({
  name,
  category: 'INIT',
  tones: [defaultTone(true), defaultTone(false)],
  structure: 'mix',
  structureDepth: 64,
  level: 100,
  pan: 0,
  mono: false,
  legato: false,
  portamento: false,
  portaTime: 20,
  bendRange: 2,
  analogFeel: 0,
  octave: 0,
});

export const defaultRealtime = (): Realtime => ({
  cutoff: 0, resonance: 0, envDepth: 0, attack: 0, decay: 0, release: 0, lfoRate: 0, lfoDepth: 0, pitch: 0,
});

export const defaultPart = (index: number, patch: Patch = defaultPatch()): PartSetup => ({
  patchRef: index === 0 ? '' : 'INIT',
  patch,
  level: 100,
  pan: 0,
  key: 0,
  rev: index === 0 ? 20 : 30,
  dly: 0,
  efx: false,
  mute: false,
  midiCh: index === 0 ? 10 : index,
  rt: defaultRealtime(),
});

export const defaultDrum = (note: number, name: string, model: DrumInst['model']): DrumInst => ({
  note, name, model, tune: 0, decay: 64, tone: 64, snap: 64, drive: 0, level: 110, pan: 0, rev: 0, dly: 0, choke: 0, velSens: 80,
});

export const emptyKit = (): Kit => ({ name: 'EMPTY', category: 'INIT', insts: [] });

export const defaultEfx = (): EfxSetup => ({ type: 'isolator', params: {}, level: 127, rev: 0, dly: 0 });
export const defaultReverb = (): ReverbSetup => ({ type: 'room2', time: 70, hfDamp: 60, preDelay: 10, level: 90 });
export const defaultDelay = (): DelaySetup => ({
  type: 'pingpong', sync: '1/8D', timeMs: 300, feedback: 50, hfDamp: 60, level: 90, toReverb: 20,
});
export const defaultFx = (): FxSetup => ({ efx: defaultEfx(), reverb: defaultReverb(), delay: defaultDelay() });

export const emptyPattern = (id: string, name = 'INIT PATTERN'): Pattern => ({
  id,
  name,
  genre: 'INIT',
  tempo: 120,
  measures: 2,
  beat: [4, 4],
  tracks: Array.from({ length: NUM_PARTS }, () => []),
  muteTrack: [],
  parts: Array.from({ length: NUM_PARTS }, (_, i) => defaultPart(i)),
  kit: emptyKit(),
  kitRef: '',
  fx: defaultFx(),
  groove: { type: 'off', resolution: 16, strength: 50 },
});

export const defaultArp = (): ArpSettings => ({
  on: false, hold: false, style: 'up', rate: '1/16', octaves: 1, gate: 60, accent: 30, shuffle: 0, beat: 'all', velocity: 0,
});

export const defaultRps = (): RpsSet => ({
  name: 'RPS SET', slots: Array.from({ length: 16 }, () => null), quantize: 'beat', hold: false,
});

export const defaultSystem = (): SystemSettings => ({
  masterLevel: 100,
  lowBoost: { on: false, freq: 80, gain: 6 },
  metronome: 'rec',
  metroLevel: 80,
  countIn: true,
  inputQuantize: '1/16',
  turntableTime: 1.2,
  dbeam: 'cutoff',
  dbeamAllParts: false,
  midi: { inputId: '', outputId: '', inMode: 'current', clockIn: false, clockOut: false, seqOut: false },
});

export const partName = (i: number) => (i === 0 ? 'R' : String(i));
export const measureTicks = (p: { beat: [number, number] }) => (96 * 4 * p.beat[0]) / p.beat[1];
export const patternTicks = (p: { beat: [number, number]; measures: number }) => measureTicks(p) * p.measures;
