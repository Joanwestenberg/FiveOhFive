import type { EfxType } from './types';

export interface EfxParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  options?: string[]; // value is an index into options
  help: string;
}

export interface EfxDef {
  type: EfxType;
  name: string;
  help: string;
  ctrl: [string, string]; // params bound to the EFX CTRL 1 / 2 knobs
  params: EfxParamDef[];
}

export const RATE_OPTIONS = ['FREE', '4/1', '2/1', '1/1', '1/2', '1/2T', '1/4', '1/4D', '1/4T', '1/8', '1/8D', '1/8T', '1/16', '1/16D', '1/16T', '1/32'];
const WAVES = ['TRI', 'SQR', 'SIN', 'SAW UP', 'SAW DN'];

const p = (key: string, label: string, def: number, help: string, min = 0, max = 127): EfxParamDef => ({ key, label, min, max, def, help });
const o = (key: string, label: string, options: string[], def: number, help: string): EfxParamDef => ({
  key, label, min: 0, max: options.length - 1, def, options, help,
});
const sync = (def = 0, key = 'sync', label = 'SYNC') => o(key, label, RATE_OPTIONS, def, 'Tempo sync note value. FREE uses the RATE knob instead.');
const steps = (prefix: string, defs: number[]) =>
  defs.map((d, i) => p(`${prefix}${i + 1}`, `STEP ${i + 1}`, d, `Value of step ${i + 1} in the 16-step sequence.`));

export const EFX_DEFS: EfxDef[] = [
  {
    type: 'isolator', name: 'ISOLATOR', help: 'DJ-style three-band isolator. Pull a band to zero to kill it completely.', ctrl: ['low', 'high'],
    params: [p('low', 'LOW', 100, 'Low band level. 100 is unity, 0 kills the band.'), p('mid', 'MID', 100, 'Mid band level.'), p('high', 'HIGH', 100, 'High band level.')],
  },
  {
    type: 'superFilter', name: 'SUPER FILTER', help: 'Steep resonant filter with an optional tempo-synced LFO.', ctrl: ['cutoff', 'resonance'],
    params: [
      o('ftype', 'TYPE', ['LPF', 'BPF', 'HPF', 'NOTCH'], 0, 'Filter response.'),
      p('cutoff', 'CUTOFF', 90, 'Cutoff frequency.'), p('resonance', 'RESO', 40, 'Resonance peak at the cutoff.'),
      p('gain', 'GAIN', 64, 'Output gain to make up level lost in the filter.'),
      o('mod', 'MOD', ['OFF', 'ON'], 0, 'Turns the filter LFO on.'), o('wave', 'WAVE', WAVES, 0, 'LFO waveform.'),
      p('rate', 'RATE', 60, 'LFO rate when SYNC is FREE.'), sync(9), p('depth', 'DEPTH', 60, 'LFO depth on the cutoff.'),
    ],
  },
  {
    type: 'stepFilter', name: 'STEP FILTER', help: 'Cutoff steps through a 16-step pattern locked to tempo.', ctrl: ['resonance', 'depth'],
    params: [
      sync(12), p('resonance', 'RESO', 70, 'Resonance.'), p('depth', 'DEPTH', 100, 'How far the steps move the cutoff.'),
      p('base', 'BASE', 30, 'Cutoff at step value 0.'), p('glide', 'GLIDE', 20, 'Smoothing between steps.'),
      o('ftype', 'TYPE', ['LPF', 'BPF', 'HPF'], 0, 'Filter response.'),
      ...steps('s', [127, 30, 80, 20, 110, 40, 90, 10, 127, 50, 70, 30, 100, 20, 60, 90]),
    ],
  },
  {
    type: 'loFi', name: 'LO-FI', help: 'Bit and sample-rate reduction for crunchy, vintage-sampler grit.', ctrl: ['bits', 'rate'],
    params: [p('bits', 'BITS', 60, 'Bit depth. Lower is crunchier.'), p('rate', 'DOWNSAMPLE', 40, 'Sample rate reduction.'), p('tone', 'TONE', 90, 'Post filter.'), p('noise', 'NOISE', 0, 'Added vinyl-style hiss.'), p('mix', 'MIX', 127, 'Wet/dry balance.')],
  },
  {
    type: 'distortion', name: 'DISTORTION', help: 'Hard-clipping distortion.', ctrl: ['drive', 'tone'],
    params: [p('drive', 'DRIVE', 80, 'Amount of distortion.'), p('tone', 'TONE', 70, 'Brightness after clipping.'), p('level', 'LEVEL', 70, 'Output level.')],
  },
  {
    type: 'overdrive', name: 'OVERDRIVE', help: 'Warm, soft-clipping overdrive.', ctrl: ['drive', 'tone'],
    params: [p('drive', 'DRIVE', 60, 'Amount of drive.'), p('tone', 'TONE', 70, 'Brightness after clipping.'), p('level', 'LEVEL', 80, 'Output level.')],
  },
  {
    type: 'compressor', name: 'COMPRESSOR', help: 'Evens out level and adds punch.', ctrl: ['threshold', 'gain'],
    params: [p('threshold', 'THRESHOLD', 60, 'Level above which compression starts. Higher values compress harder.'), p('ratio', 'RATIO', 80, 'Compression ratio.'), p('attack', 'ATTACK', 30, 'Attack time.'), p('release', 'RELEASE', 50, 'Release time.'), p('gain', 'GAIN', 70, 'Make-up gain.')],
  },
  {
    type: 'phaser', name: 'PHASER', help: 'Sweeping all-pass phaser.', ctrl: ['manual', 'rate'],
    params: [p('manual', 'MANUAL', 60, 'Centre frequency.'), p('rate', 'RATE', 40, 'Sweep rate.'), sync(0), p('depth', 'DEPTH', 90, 'Sweep depth.'), p('resonance', 'RESO', 60, 'Feedback.'), o('stages', 'STAGES', ['4', '8', '12'], 1, 'Number of all-pass stages.'), p('mix', 'MIX', 100, 'Wet/dry balance.')],
  },
  {
    type: 'stepPhaser', name: 'STEP PHASER', help: 'Phaser whose sweep moves in tempo-synced steps.', ctrl: ['manual', 'resonance'],
    params: [p('manual', 'MANUAL', 60, 'Centre frequency.'), p('rate', 'RATE', 40, 'Sweep rate.'), sync(6), sync(12, 'step', 'STEP'), p('depth', 'DEPTH', 90, 'Sweep depth.'), p('resonance', 'RESO', 70, 'Feedback.'), p('mix', 'MIX', 100, 'Wet/dry balance.')],
  },
  {
    type: 'flanger', name: 'FLANGER', help: 'Stereo flanger: jet-plane comb sweeps.', ctrl: ['rate', 'feedback'],
    params: [p('delay', 'PRE DELAY', 20, 'Base delay time.'), p('rate', 'RATE', 30, 'Sweep rate.'), sync(0), p('depth', 'DEPTH', 80, 'Sweep depth.'), p('feedback', 'FEEDBACK', 90, 'Feedback. Above 64 is positive, below is negative.'), p('mix', 'MIX', 100, 'Wet/dry balance.')],
  },
  {
    type: 'stepFlanger', name: 'STEP FLANGER', help: 'Flanger whose delay jumps in tempo-synced steps.', ctrl: ['feedback', 'depth'],
    params: [p('delay', 'PRE DELAY', 20, 'Base delay time.'), sync(12, 'step', 'STEP'), p('depth', 'DEPTH', 80, 'Step depth.'), p('feedback', 'FEEDBACK', 100, 'Feedback.'), p('mix', 'MIX', 100, 'Wet/dry balance.'), ...steps('s', [0, 40, 80, 120, 100, 60, 20, 90, 30, 110, 50, 10, 70, 127, 40, 80])],
  },
  {
    type: 'chorus', name: 'CHORUS', help: 'Stereo chorus for width and movement.', ctrl: ['rate', 'depth'],
    params: [p('rate', 'RATE', 30, 'Modulation rate.'), p('depth', 'DEPTH', 60, 'Modulation depth.'), p('delay', 'PRE DELAY', 40, 'Base delay.'), p('feedback', 'FEEDBACK', 10, 'Feedback.'), p('mix', 'MIX', 80, 'Wet/dry balance.')],
  },
  {
    type: 'spaceD', name: 'SPACE-D', help: 'Multi-tap ensemble chorus with no pitch wobble on the centre.', ctrl: ['depth', 'mix'],
    params: [p('rate', 'RATE', 25, 'Modulation rate.'), p('depth', 'DEPTH', 70, 'Modulation depth.'), p('mix', 'MIX', 90, 'Wet/dry balance.')],
  },
  {
    type: 'tremolo', name: 'TREMOLO', help: 'Volume modulation.', ctrl: ['rate', 'depth'],
    params: [o('wave', 'WAVE', WAVES, 2, 'LFO waveform.'), p('rate', 'RATE', 70, 'Rate when SYNC is FREE.'), sync(12), p('depth', 'DEPTH', 90, 'Modulation depth.')],
  },
  {
    type: 'autoPan', name: 'AUTO PAN', help: 'Sweeps the sound between left and right.', ctrl: ['rate', 'depth'],
    params: [o('wave', 'WAVE', WAVES, 2, 'LFO waveform.'), p('rate', 'RATE', 50, 'Rate when SYNC is FREE.'), sync(9), p('depth', 'DEPTH', 110, 'Modulation depth.')],
  },
  {
    type: 'slicer', name: 'SLICER', help: 'Chops the sound into a rhythmic gate pattern.', ctrl: ['depth', 'attack'],
    params: [sync(12), p('depth', 'DEPTH', 127, 'Gate depth.'), p('attack', 'ATTACK', 10, 'Smoothing of each slice.'), p('shuffle', 'SHUFFLE', 0, 'Delays the even steps for swing.'), ...steps('s', [127, 0, 127, 127, 0, 127, 0, 127, 127, 0, 127, 0, 127, 127, 0, 127])],
  },
  {
    type: 'autoWah', name: 'AUTO WAH', help: 'Envelope and LFO-controlled resonant filter.', ctrl: ['manual', 'sens'],
    params: [o('ftype', 'TYPE', ['LPF', 'BPF'], 1, 'Filter response.'), p('manual', 'MANUAL', 40, 'Base cutoff.'), p('sens', 'SENS', 70, 'Envelope follower sensitivity.'), p('resonance', 'RESO', 80, 'Resonance.'), p('rate', 'RATE', 40, 'LFO rate.'), sync(0), p('depth', 'DEPTH', 30, 'LFO depth.')],
  },
  {
    type: 'ringMod', name: 'RING MOD', help: 'Multiplies the input with a sine for metallic, bell-like tones.', ctrl: ['freq', 'mix'],
    params: [p('freq', 'FREQ', 60, 'Modulator frequency.'), p('sens', 'SENS', 0, 'Input level raises the modulator frequency.'), p('mix', 'MIX', 100, 'Wet/dry balance.')],
  },
  {
    type: 'stepRingMod', name: 'STEP RING MOD', help: 'Ring modulator stepping through 16 frequencies in time.', ctrl: ['mix', 'glide'],
    params: [sync(12), p('mix', 'MIX', 110, 'Wet/dry balance.'), p('glide', 'GLIDE', 10, 'Smoothing between steps.'), ...steps('s', [60, 90, 30, 110, 50, 70, 20, 100, 80, 40, 120, 10, 60, 90, 30, 127])],
  },
  {
    type: 'rotary', name: 'ROTARY', help: 'Rotating speaker cabinet. Switch SPEED for the classic organ ramp.', ctrl: ['speed', 'drive'],
    params: [o('speed', 'SPEED', ['SLOW', 'FAST'], 0, 'Rotor speed.'), p('drive', 'DRIVE', 30, 'Amp overdrive.'), p('balance', 'BALANCE', 64, 'Horn / drum balance.'), p('accel', 'ACCEL', 60, 'How quickly the rotors change speed.')],
  },
  {
    type: 'enhancer', name: 'ENHANCER', help: 'Adds high harmonics for presence.', ctrl: ['sens', 'mix'],
    params: [p('sens', 'SENS', 80, 'Amount of harmonics generated.'), p('freq', 'FREQ', 70, 'Frequency above which harmonics are added.'), p('mix', 'MIX', 90, 'Blend.')],
  },
  {
    type: 'bpmDelay', name: 'BPM DELAY', help: 'Tempo-locked delay with its own feedback, separate from the main delay.', ctrl: ['feedback', 'mix'],
    params: [sync(10, 'time', 'TIME'), p('feedback', 'FEEDBACK', 70, 'Number of repeats.'), p('damp', 'HF DAMP', 60, 'Darkens each repeat.'), o('mode', 'MODE', ['MONO', 'PING-PONG'], 1, 'Delay mode.'), p('mix', 'MIX', 64, 'Wet/dry balance.')],
  },
  {
    type: 'pitchShifter', name: 'PITCH SHIFTER', help: 'Shifts pitch without changing tempo.', ctrl: ['pitch', 'mix'],
    params: [p('pitch', 'PITCH', 0, 'Shift in semitones.', -24, 24), p('fine', 'FINE', 0, 'Fine shift in cents.', -50, 50), p('feedback', 'FEEDBACK', 0, 'Feedback for spiralling shifts.'), p('mix', 'MIX', 64, 'Wet/dry balance.')],
  },
  {
    type: 'radio', name: 'RADIO TUNING', help: 'Narrow-band, noisy AM radio simulation.', ctrl: ['tune', 'noise'],
    params: [p('tune', 'TUNE', 64, 'Band centre.'), p('noise', 'NOISE', 30, 'Static noise level.'), p('drive', 'DRIVE', 40, 'Speaker distortion.'), p('mix', 'MIX', 127, 'Wet/dry balance.')],
  },
  {
    type: 'eq', name: '4-BAND EQ', help: 'Low shelf, two peaking mids and a high shelf.', ctrl: ['lowGain', 'highGain'],
    params: [
      p('lowGain', 'LOW', 0, 'Low shelf gain (dB).', -15, 15), p('mid1Freq', 'MID1 FREQ', 50, 'Low-mid frequency.'), p('mid1Gain', 'MID1', 0, 'Low-mid gain (dB).', -15, 15),
      p('mid2Freq', 'MID2 FREQ', 90, 'High-mid frequency.'), p('mid2Gain', 'MID2', 0, 'High-mid gain (dB).', -15, 15), p('highGain', 'HIGH', 0, 'High shelf gain (dB).', -15, 15),
    ],
  },
];

export const EFX_MAP = Object.fromEntries(EFX_DEFS.map((d) => [d.type, d])) as Record<EfxType, EfxDef>;

export const efxDefaults = (type: EfxType): Record<string, number> =>
  Object.fromEntries(EFX_MAP[type].params.map((q) => [q.key, q.def]));

export const efxParam = (params: Record<string, number>, type: EfxType, key: string) => {
  const v = params[key];
  if (v !== undefined) return v;
  return EFX_MAP[type].params.find((q) => q.key === key)?.def ?? 0;
};
