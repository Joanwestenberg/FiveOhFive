// Parameter metadata: ranges and one-sentence help for every patch, tone, drum and part
// parameter. Drives the editors, the Info View and validation of the agent's tool calls.

import { WAVES } from '../engine/dsp/waves';
import { SYNC_VALUES } from '../engine/dsp/math';

export interface ParamDesc {
  key: string; // path relative to its owner, dot separated
  label: string;
  min: number;
  max: number;
  help: string;
  kind?: 'num' | 'bool' | 'enum';
  options?: string[];
}

const n = (key: string, label: string, min: number, max: number, help: string): ParamDesc => ({ key, label, min, max, help, kind: 'num' });
const b = (key: string, label: string, help: string): ParamDesc => ({ key, label, min: 0, max: 1, help, kind: 'bool' });
const e = (key: string, label: string, options: string[], help: string): ParamDesc => ({ key, label, min: 0, max: options.length - 1, help, kind: 'enum', options });

export const PATCH_PARAMS: ParamDesc[] = [
  e('structure', 'STRUCTURE', ['mix', 'ring', 'ring+2', 'fxm', 'sync'], 'How the two tones combine: mixed, ring-modulated, tone 2 frequency-modulating tone 1, or tone 1 hard-synced to tone 2.'),
  n('structureDepth', 'STRUCT DEPTH', 0, 127, 'Amount of ring modulation or FXM between the tones.'),
  n('level', 'PATCH LEVEL', 0, 127, 'Overall patch volume.'),
  n('pan', 'PATCH PAN', -64, 63, 'Overall patch stereo position.'),
  b('mono', 'MONO', 'Play one note at a time (bass and lead lines).'),
  b('legato', 'LEGATO', 'In mono mode, overlapping notes change pitch without re-triggering the envelopes.'),
  b('portamento', 'PORTAMENTO', 'Glide between notes.'),
  n('portaTime', 'PORTA TIME', 0, 127, 'Glide time.'),
  n('bendRange', 'BEND RANGE', 0, 24, 'Pitch bend range in semitones.'),
  n('analogFeel', 'ANALOG FEEL', 0, 127, 'Slow random pitch drift, like an unstable analog oscillator.'),
  n('octave', 'OCTAVE', -3, 3, 'Octave shift for the whole patch.'),
];

const ENV_T = (p: string, name: string): ParamDesc[] => [
  n(`${p}.t1`, `${name} T1`, 0, 127, `${name} time 1: attack from the start level to level 1.`),
  n(`${p}.t2`, `${name} T2`, 0, 127, `${name} time 2: move from level 1 to level 2.`),
  n(`${p}.t3`, `${name} T3`, 0, 127, `${name} time 3: move from level 2 to the sustain level.`),
  n(`${p}.t4`, `${name} T4`, 0, 127, `${name} time 4: release time after note off.`),
];

export const LFO_PARAMS = (p: string, name: string): ParamDesc[] => [
  e(`${p}.wave`, `${name} WAVE`, ['tri', 'sin', 'saw', 'sqr', 'trp', 'sh', 'rnd', 'chs'], `${name} waveform: triangle, sine, saw, square, trapezoid, sample & hold, smooth random or chaos.`),
  n(`${p}.rate`, `${name} RATE`, 0, 127, `${name} speed when not tempo-synced.`),
  e(`${p}.sync`, `${name} SYNC`, SYNC_VALUES, `${name} tempo sync note value; off uses RATE.`),
  n(`${p}.delay`, `${name} DELAY`, 0, 127, `Time after note on before ${name} starts.`),
  n(`${p}.fade`, `${name} FADE`, 0, 127, `Time for ${name} to fade in after its delay.`),
  b(`${p}.keySync`, `${name} KEY SYNC`, `Restart ${name} at every note.`),
  n(`${p}.pitch`, `${name} > PITCH`, -63, 63, `${name} depth on pitch (vibrato).`),
  n(`${p}.filter`, `${name} > FILTER`, -63, 63, `${name} depth on filter cutoff (wah).`),
  n(`${p}.amp`, `${name} > AMP`, -63, 63, `${name} depth on volume (tremolo).`),
  n(`${p}.pan`, `${name} > PAN`, -63, 63, `${name} depth on pan (auto-pan).`),
];

export const TONE_PARAMS: ParamDesc[] = [
  b('on', 'TONE ON', 'Switch this tone on or off.'),
  e('wave', 'WAVE', WAVES.map((w) => w.id), 'Oscillator waveform.'),
  n('waveParam', 'WAVE PARAM', 0, 127, 'Shape control for the waveform: pulse width, super-saw detune, FM brightness, sync ratio, feedback or pluck brightness.'),
  n('coarse', 'COARSE', -48, 48, 'Pitch offset in semitones.'),
  n('fine', 'FINE', -50, 50, 'Pitch offset in cents.'),
  n('randomPitch', 'RANDOM PITCH', 0, 127, 'Random detune per note, in cents.'),
  n('pitchKeyFollow', 'PITCH KF', -100, 200, 'How much pitch follows the keyboard (100 = normal, 0 = fixed pitch).'),
  n('penvDepth', 'P-ENV DEPTH', -12, 12, 'Pitch envelope depth in semitones.'),
  n('penvVelSens', 'P-ENV VELO', -63, 63, 'How velocity scales the pitch envelope depth.'),
  ...ENV_T('penv', 'P-ENV'),
  n('penv.l0', 'P-ENV L0', -63, 63, 'Pitch envelope start level.'),
  n('penv.l1', 'P-ENV L1', -63, 63, 'Pitch envelope level 1.'),
  n('penv.l2', 'P-ENV L2', -63, 63, 'Pitch envelope level 2.'),
  n('penv.l3', 'P-ENV L3', -63, 63, 'Pitch envelope sustain level.'),
  n('penv.l4', 'P-ENV L4', -63, 63, 'Pitch envelope end level after release.'),
  n('drive', 'DRIVE', 0, 127, 'Booster: saturates the oscillator before the filter.'),
  e('filterType', 'FILTER TYPE', ['off', 'lpf', 'lpf24', 'bpf', 'hpf', 'pkg'], 'Filter type: lowpass 12 dB, lowpass 24 dB, bandpass, highpass or peaking.'),
  n('cutoff', 'CUTOFF', 0, 127, 'Filter cutoff frequency.'),
  n('resonance', 'RESONANCE', 0, 127, 'Emphasis at the cutoff; high values squelch and self-oscillate.'),
  n('cutoffKeyFollow', 'CUTOFF KF', -100, 200, 'How much the cutoff follows the keyboard.'),
  n('fenvDepth', 'F-ENV DEPTH', -63, 63, 'Filter envelope depth.'),
  n('fenvVelSens', 'F-ENV VELO', -63, 63, 'How velocity scales the filter envelope depth.'),
  ...ENV_T('fenv', 'F-ENV'),
  n('fenv.l0', 'F-ENV L0', 0, 127, 'Filter envelope start level.'),
  n('fenv.l1', 'F-ENV L1', 0, 127, 'Filter envelope level 1 (peak).'),
  n('fenv.l2', 'F-ENV L2', 0, 127, 'Filter envelope level 2.'),
  n('fenv.l3', 'F-ENV L3', 0, 127, 'Filter envelope sustain level.'),
  n('fenv.l4', 'F-ENV L4', 0, 127, 'Filter envelope end level after release.'),
  n('level', 'TONE LEVEL', 0, 127, 'Tone volume.'),
  n('pan', 'TONE PAN', -64, 63, 'Tone stereo position.'),
  n('velSens', 'AMP VELO', 0, 127, 'How much velocity changes the volume.'),
  ...ENV_T('aenv', 'A-ENV'),
  n('aenv.l1', 'A-ENV L1', 0, 127, 'Amp envelope level 1 (peak).'),
  n('aenv.l2', 'A-ENV L2', 0, 127, 'Amp envelope level 2.'),
  n('aenv.l3', 'A-ENV L3', 0, 127, 'Amp envelope sustain level.'),
  ...LFO_PARAMS('lfo1', 'LFO1'),
  ...LFO_PARAMS('lfo2', 'LFO2'),
];

export const DRUM_PARAMS: ParamDesc[] = [
  e('model', 'MODEL', ['kick', 'snare', 'clap', 'hat', 'cymbal', 'tom', 'rim', 'clave', 'cowbell', 'shaker', 'conga', 'zap', 'noise', 'tone', 'scratch', 'click'], 'Synthesis model for this drum.'),
  n('tune', 'TUNE', -24, 24, 'Pitch in semitones.'),
  n('decay', 'DECAY', 0, 127, 'Length of the sound.'),
  n('tone', 'TONE', 0, 127, 'Model colour: pitch sweep for kicks, brightness for hats and snares.'),
  n('snap', 'SNAP', 0, 127, 'Model transient: click on kicks, snappy noise on snares, noise mix on hats.'),
  n('drive', 'DRIVE', 0, 127, 'Saturation.'),
  n('level', 'LEVEL', 0, 127, 'Volume.'),
  n('pan', 'PAN', -64, 63, 'Stereo position.'),
  n('rev', 'REVERB', 0, 127, 'Send to reverb.'),
  n('dly', 'DELAY', 0, 127, 'Send to delay.'),
  n('choke', 'CHOKE', 0, 8, 'Choke group: drums in the same group cut each other off (0 = none).'),
  n('velSens', 'VELO SENS', 0, 127, 'How much velocity changes the volume.'),
  e('wave', 'WAVE', WAVES.map((w) => w.id), 'Waveform for the TONE model.'),
];

export const PART_PARAMS: ParamDesc[] = [
  n('level', 'LEVEL', 0, 127, 'Part volume.'),
  n('pan', 'PAN', -64, 63, 'Part stereo position.'),
  n('key', 'KEY SHIFT', -48, 48, 'Transposes the part in semitones.'),
  n('rev', 'REVERB SEND', 0, 127, 'Part send to the reverb.'),
  n('dly', 'DELAY SEND', 0, 127, 'Part send to the delay.'),
  b('efx', 'EFX', 'Route this part through the multi-effect.'),
  b('mute', 'MUTE', 'Silence this part.'),
  n('midiCh', 'MIDI CH', 1, 16, 'MIDI channel this part receives and transmits on.'),
  n('rt.cutoff', 'RT CUTOFF', -63, 63, 'Realtime cutoff offset (the CUTOFF knob).'),
  n('rt.resonance', 'RT RESONANCE', -63, 63, 'Realtime resonance offset.'),
  n('rt.envDepth', 'RT ENV DEPTH', -63, 63, 'Realtime filter envelope depth offset.'),
  n('rt.attack', 'RT ATTACK', -63, 63, 'Realtime attack time offset.'),
  n('rt.decay', 'RT DECAY', -63, 63, 'Realtime decay time offset.'),
  n('rt.release', 'RT RELEASE', -63, 63, 'Realtime release time offset.'),
  n('rt.lfoRate', 'RT LFO RATE', -63, 63, 'Realtime LFO1 rate offset.'),
  n('rt.lfoDepth', 'RT LFO DEPTH', -63, 63, 'Realtime LFO1 depth offset.'),
  n('rt.pitch', 'RT PITCH', -63, 63, 'Realtime fine pitch offset in cents.'),
];

/** All patch paths the agent can set, e.g. "mono", "tone1.cutoff", "tone2.lfo1.rate". */
export const PATCH_PATHS: Record<string, ParamDesc> = (() => {
  const out: Record<string, ParamDesc> = {};
  for (const p of PATCH_PARAMS) out[p.key] = p;
  for (const t of [1, 2]) for (const p of TONE_PARAMS) out[`tone${t}.${p.key}`] = p;
  return out;
})();

export const paramInfo = (d: ParamDesc) => `${d.label}|${d.help}`;

export const validateParam = (d: ParamDesc, v: unknown): number | string | boolean => {
  if (d.kind === 'bool') {
    if (typeof v === 'boolean') return v;
    if (v === 0 || v === 1) return !!v;
    if (v === 'on' || v === 'true') return true;
    if (v === 'off' || v === 'false') return false;
    throw new Error(`${d.key} expects true/false`);
  }
  if (d.kind === 'enum') {
    const s = String(v);
    if (!d.options!.includes(s)) throw new Error(`${d.key} must be one of: ${d.options!.join(', ')}`);
    return s;
  }
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${d.key} expects a number ${d.min}..${d.max}`);
  return Math.max(d.min, Math.min(d.max, Math.round(x)));
};
