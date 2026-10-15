// Core data model for FiveOhFive. Everything here is plain JSON so it can be
// structured-cloned into the AudioWorklet, saved to IndexedDB and handed to the agent.

export const PPQN = 96;
export const NUM_PARTS = 8; // index 0 = Rhythm part (R), 1..7 = Parts 1-7
export const RHYTHM_PART = 0;

export type LfoWave = 'tri' | 'sin' | 'saw' | 'sqr' | 'trp' | 'sh' | 'rnd' | 'chs';
export type FilterType = 'off' | 'lpf' | 'lpf24' | 'bpf' | 'hpf' | 'pkg';
export type Structure = 'mix' | 'ring' | 'ring+2' | 'fxm' | 'sync';
export type SyncValue =
  | 'off' | '4/1' | '2/1' | '1/1' | '1/2' | '1/2T' | '1/4' | '1/4D' | '1/4T' | '1/8' | '1/8D' | '1/8T'
  | '1/16' | '1/16D' | '1/16T' | '1/32';

/** Envelope with JV/MC-505 style 4 times and levels. Times 0-127. */
export interface AmpEnv { t1: number; t2: number; t3: number; t4: number; l1: number; l2: number; l3: number }
/** Pitch/filter envelope: levels are bipolar for pitch (-63..63) and unipolar 0-127 for filter. */
export interface ModEnv { t1: number; t2: number; t3: number; t4: number; l0: number; l1: number; l2: number; l3: number; l4: number }

export interface Lfo {
  wave: LfoWave;
  rate: number; // 0-127
  sync: SyncValue; // tempo sync overrides rate when not 'off'
  delay: number; // 0-127
  fade: number; // 0-127
  keySync: boolean;
  pitch: number; // -63..63
  filter: number; // -63..63
  amp: number; // -63..63
  pan: number; // -63..63
}

export interface Tone {
  on: boolean;
  wave: string; // id from presets/waves
  waveParam: number; // 0-127 (pulse width, detune, FM index, sync ratio...)
  coarse: number; // -48..48 semitones
  fine: number; // -50..50 cents
  randomPitch: number; // 0-127 cents of random detune per note
  pitchKeyFollow: number; // -100..200 %
  penvDepth: number; // -12..12 semitones
  penvVelSens: number; // -63..63
  penv: ModEnv; // levels -63..63
  drive: number; // 0-127 booster before the filter
  filterType: FilterType;
  cutoff: number; // 0-127
  resonance: number; // 0-127
  cutoffKeyFollow: number; // -100..200 %
  fenvDepth: number; // -63..63
  fenvVelSens: number; // -63..63
  fenv: ModEnv; // levels 0-127
  level: number; // 0-127
  pan: number; // -64..63
  velSens: number; // 0-127 (amplitude velocity sensitivity)
  aenv: AmpEnv;
  lfo1: Lfo;
  lfo2: Lfo;
  delayMode?: 'off'; // reserved
}

export interface Patch {
  name: string;
  category: string;
  tones: [Tone, Tone];
  structure: Structure;
  structureDepth: number; // 0-127 FXM depth / ring mix
  level: number; // 0-127
  pan: number; // -64..63
  mono: boolean;
  legato: boolean;
  portamento: boolean;
  portaTime: number; // 0-127
  bendRange: number; // 0-24
  analogFeel: number; // 0-127 slow random pitch drift
  octave: number; // -3..3
}

export type DrumModel =
  | 'kick' | 'snare' | 'clap' | 'hat' | 'cymbal' | 'tom' | 'rim' | 'clave' | 'cowbell'
  | 'shaker' | 'conga' | 'zap' | 'noise' | 'tone' | 'scratch' | 'click';

export interface DrumInst {
  note: number;
  name: string;
  model: DrumModel;
  tune: number; // -24..24 semitones
  decay: number; // 0-127
  tone: number; // 0-127 model-specific colour (brightness / sweep)
  snap: number; // 0-127 model-specific transient / noise amount
  drive: number; // 0-127
  level: number; // 0-127
  pan: number; // -64..63
  rev: number; // 0-127
  dly: number; // 0-127
  choke: number; // 0 = none, otherwise group id
  wave?: string; // for model 'tone'
  velSens: number; // 0-127
}

export interface Kit {
  name: string;
  category: string;
  insts: DrumInst[];
}

/** Realtime-modify offsets for a part (CUTOFF, RESONANCE, ATTACK... knobs). -63..63 */
export interface Realtime {
  cutoff: number;
  resonance: number;
  envDepth: number;
  attack: number;
  decay: number;
  release: number;
  lfoRate: number;
  lfoDepth: number;
  pitch: number; // fine pitch offset in cents/2
}

export interface PartSetup {
  patchRef: string; // display reference e.g. "P:BASS 01"
  patch: Patch; // embedded working copy (unused for part R)
  level: number; // 0-127
  pan: number; // -64..63
  key: number; // -48..48 key shift
  rev: number; // 0-127
  dly: number; // 0-127
  efx: boolean;
  mute: boolean;
  midiCh: number; // 1-16
  rt: Realtime;
}

export type EfxType =
  | 'isolator' | 'superFilter' | 'stepFilter' | 'loFi' | 'distortion' | 'overdrive' | 'compressor'
  | 'phaser' | 'stepPhaser' | 'flanger' | 'stepFlanger' | 'chorus' | 'spaceD' | 'tremolo' | 'autoPan'
  | 'slicer' | 'autoWah' | 'ringMod' | 'stepRingMod' | 'rotary' | 'enhancer' | 'bpmDelay'
  | 'pitchShifter' | 'radio' | 'eq';

export interface EfxSetup {
  type: EfxType;
  params: Record<string, number>;
  level: number; // 0-127 output level
  rev: number; // 0-127 send from EFX output to reverb
  dly: number; // 0-127 send from EFX output to delay
}

export type ReverbType = 'room1' | 'room2' | 'stage' | 'hall1' | 'hall2' | 'plate' | 'delay' | 'panDelay';
export interface ReverbSetup { type: ReverbType; time: number; hfDamp: number; preDelay: number; level: number }

export type DelayType = 'mono' | 'stereo' | 'pingpong';
export interface DelaySetup {
  type: DelayType;
  sync: SyncValue;
  timeMs: number; // used when sync = 'off' (1-1000)
  feedback: number; // 0-127
  hfDamp: number; // 0-127
  level: number; // 0-127
  toReverb: number; // 0-127
}

export interface FxSetup { efx: EfxSetup; reverb: ReverbSetup; delay: DelaySetup }

export interface Groove {
  type: string; // 'off' | 'shuffle' | groove template id
  resolution: 8 | 16;
  strength: number; // 0-100
}

export interface NoteEv { t: number; k: 'n'; n: number; v: number; g: number }
export interface CcEv { t: number; k: 'c'; c: number; v: number }
export interface PbEv { t: number; k: 'b'; v: number } // -8192..8191
export type SeqEv = NoteEv | CcEv | PbEv;
export interface MuteEv { t: number; part: number; mute: boolean }

export interface Pattern {
  id: string; // 'P001' presets, 'U001'.. user
  name: string;
  genre: string;
  tempo: number; // 20-300
  measures: number; // 1-32
  beat: [number, number]; // time signature
  tracks: SeqEv[][]; // NUM_PARTS tracks, sorted by t
  muteTrack: MuteEv[];
  parts: PartSetup[]; // NUM_PARTS
  kit: Kit; // embedded working copy of the rhythm set
  kitRef: string;
  fx: FxSetup;
  groove: Groove;
}

export type ArpRate = '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32';
export interface ArpSettings {
  on: boolean;
  hold: boolean;
  style: string; // id from presets/arp
  rate: ArpRate;
  octaves: number; // -3..3
  gate: number; // 1-100 %
  accent: number; // 0-100
  shuffle: number; // 0-100
  beat: string; // beat pattern id
  velocity: number; // 0 = real (played), else fixed 1-127
}

export interface RpsSlot { patternId: string; part: number; target: number }
export interface RpsSet {
  name: string;
  slots: (RpsSlot | null)[]; // 16
  quantize: 'off' | '1/16' | 'beat' | 'measure';
  hold: boolean;
}

export interface SongStep { patternId: string; repeats: number }
export interface Song { id: string; name: string; steps: SongStep[]; loop: boolean }

export type DBeamTarget =
  | 'off' | 'cutoff' | 'resonance' | 'cutoff+res' | 'pitchUp' | 'pitchDown' | 'lfoDepth' | 'efx1' | 'efx2'
  | 'level' | 'turntable' | 'reverb' | 'delay';

export interface SystemSettings {
  masterLevel: number; // 0-127
  lowBoost: { on: boolean; freq: number; gain: number }; // Hz, dB
  metronome: 'off' | 'rec' | 'always';
  metroLevel: number; // 0-127
  countIn: boolean;
  inputQuantize: 'off' | '1/32' | '1/16T' | '1/16' | '1/8T' | '1/8' | '1/4';
  turntableTime: number; // seconds 0.1-5
  dbeam: DBeamTarget;
  dbeamAllParts: boolean;
  midi: {
    inputId: string; // '' = all inputs
    outputId: string; // '' = none
    inMode: 'current' | 'channels'; // route all input to current part, or by MIDI channel
    clockIn: boolean;
    clockOut: boolean;
    seqOut: boolean; // send sequencer notes to MIDI out
  };
}
