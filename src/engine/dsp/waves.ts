// Waveform catalog. The MC-505 ships ~500 ROM waveforms; we have no sample ROM, so each wave
// here is produced by a generator: band-limited analog shapes, additive wavetables, FM pairs,
// Karplus-Strong strings and noise. `waveParam` (0-127) on the tone tweaks each family.

export type WaveKind = 'blep' | 'supersaw' | 'noise' | 'fm' | 'table' | 'pluck' | 'feedback' | 'sync';

export interface WaveDef {
  id: string;
  name: string;
  group: string;
  kind: WaveKind;
  help: string;
  /** blep shape */
  shape?: 'saw' | 'square' | 'pulse' | 'tri' | 'sine';
  /** FM: modulator ratio, max index, index decay seconds (0 = sustained), feedback */
  ratio?: number;
  index?: number;
  indexDecay?: number;
  /** Table: harmonic amplitude function (1-based harmonic number) */
  partials?: (h: number) => number;
  /** Table: octave offset applied to playback (for organ tables with a 16' sub). */
  octave?: number;
  /** Pluck: damping 0..1, brightness of excitation 0..1 */
  damping?: number;
  /** Noise colour */
  noise?: 'white' | 'pink';
}

const drawbars = (bars: number[]) => {
  // footages 16, 5 1/3, 8, 4, 2 2/3, 2, 1 3/5, 1 1/3, 1 → harmonic of a 16' fundamental
  const harm = [1, 3, 2, 4, 6, 8, 10, 12, 16];
  const amps = new Map<number, number>();
  bars.forEach((b, i) => amps.set(harm[i], (b / 8) * Math.pow(10, ((b - 8) * 3) / 20)));
  return (h: number) => amps.get(h) ?? 0;
};

const formant = (centers: number[], widths: number[], gains: number[], f0 = 130) => (h: number) => {
  const f = h * f0;
  let a = 0;
  for (let i = 0; i < centers.length; i++) {
    const d = (f - centers[i]) / widths[i];
    a += gains[i] * Math.exp(-d * d);
  }
  return (a / Math.sqrt(h)) * 0.9 + 0.1 / h;
};

const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const digital = (seed: number, tilt: number) => {
  const r = seeded(seed);
  const tbl = Array.from({ length: 64 }, (_, i) => (r() > 0.45 ? r() : 0) / Math.pow(i + 1, tilt));
  tbl[0] = 1;
  return (h: number) => (h <= 64 ? tbl[h - 1] : 0);
};

export const WAVES: WaveDef[] = [
  // Analog
  { id: 'saw', name: 'SAW', group: 'ANALOG', kind: 'blep', shape: 'saw', help: 'Band-limited sawtooth. Bright, buzzy, the basis of most synth sounds.' },
  { id: 'square', name: 'SQUARE', group: 'ANALOG', kind: 'blep', shape: 'square', help: 'Band-limited square wave. Hollow, woody tone.' },
  { id: 'pulse', name: 'PULSE', group: 'ANALOG', kind: 'blep', shape: 'pulse', help: 'Variable pulse. Wave Param sets the pulse width; modulate it with the LFO for PWM.' },
  { id: 'tri', name: 'TRIANGLE', group: 'ANALOG', kind: 'blep', shape: 'tri', help: 'Triangle wave. Soft and flute-like.' },
  { id: 'sine', name: 'SINE', group: 'ANALOG', kind: 'blep', shape: 'sine', help: 'Pure sine. Sub bass, whistles and FM-style tones.' },
  { id: 'supersaw', name: 'SUPER SAW', group: 'ANALOG', kind: 'supersaw', help: 'Seven detuned saws. Wave Param sets the detune. The classic trance lead and pad.' },
  { id: 'syncsaw', name: 'SYNC SAW', group: 'ANALOG', kind: 'sync', shape: 'saw', help: 'Hard-synced saw. Wave Param sets the slave ratio; sweep it for tearing sync leads.' },
  { id: 'syncsqr', name: 'SYNC SQR', group: 'ANALOG', kind: 'sync', shape: 'square', help: 'Hard-synced square. Wave Param sets the slave ratio.' },
  { id: 'fbosc', name: 'FEEDBACK OSC', group: 'ANALOG', kind: 'feedback', help: 'Self-modulating sine. Wave Param sets feedback, from sine through to a raspy saw.' },
  { id: 'tbsaw', name: 'TB SAW', group: 'ANALOG', kind: 'table', partials: (h) => (1 / h) * (h === 1 ? 1.2 : 1) * Math.exp(-h / 90), help: 'Saw with the slightly rounded top of a bass line synth. Pair with LPF and high resonance.' },
  { id: 'tbsqr', name: 'TB SQR', group: 'ANALOG', kind: 'table', partials: (h) => (h % 2 ? 1 / h : 0.18 / h) * Math.exp(-h / 70), help: 'The waveshaped square of a bass line synth. Mostly odd harmonics with a little even content.' },
  { id: 'noise', name: 'WHITE NOISE', group: 'NOISE', kind: 'noise', noise: 'white', help: 'White noise. Use the filter to shape it into wind, hats or sweeps.' },
  { id: 'pink', name: 'PINK NOISE', group: 'NOISE', kind: 'noise', noise: 'pink', help: 'Pink noise. Darker and more even across octaves than white noise.' },
  // Keys / organ
  { id: 'organ1', name: 'JAZZ ORGAN', group: 'ORGAN', kind: 'table', partials: drawbars([8, 8, 8, 0, 0, 0, 0, 0, 0]), octave: -1, help: 'Tonewheel organ with drawbars 888000000.' },
  { id: 'organ2', name: 'ROCK ORGAN', group: 'ORGAN', kind: 'table', partials: drawbars([8, 8, 8, 8, 0, 0, 0, 0, 8]), octave: -1, help: 'Tonewheel organ with the top drawbar pulled out.' },
  { id: 'organ3', name: 'FULL ORGAN', group: 'ORGAN', kind: 'table', partials: drawbars([8, 8, 8, 8, 8, 8, 8, 8, 8]), octave: -1, help: 'All drawbars out. Huge and buzzy.' },
  { id: 'organ4', name: 'HOUSE ORGAN', group: 'ORGAN', kind: 'table', partials: drawbars([0, 0, 8, 8, 6, 8, 0, 0, 0]), octave: -1, help: 'Bright organ stab in the style of early-90s house.' },
  { id: 'epiano', name: 'E.PIANO', group: 'KEYS', kind: 'fm', ratio: 1, index: 2.2, indexDecay: 0.9, help: 'FM electric piano tine. Wave Param sets the brightness of the strike.' },
  { id: 'tine', name: 'TINE EP', group: 'KEYS', kind: 'fm', ratio: 14, index: 1.2, indexDecay: 0.08, help: 'Metallic tine attack on a mellow body.' },
  { id: 'clav', name: 'CLAV', group: 'KEYS', kind: 'table', partials: (h) => Math.abs(Math.sin((h * Math.PI) / 7)) / Math.pow(h, 0.7), help: 'Narrow-pulse clavinet spectrum. Funky with a fast filter envelope.' },
  { id: 'piano', name: 'PIANO', group: 'KEYS', kind: 'fm', ratio: 1, index: 1.4, indexDecay: 1.6, help: 'FM approximation of an acoustic piano body.' },
  { id: 'mallet', name: 'MALLET', group: 'KEYS', kind: 'fm', ratio: 4, index: 2.5, indexDecay: 0.12, help: 'Marimba / vibes style struck bar.' },
  { id: 'bell', name: 'BELL', group: 'KEYS', kind: 'fm', ratio: 3.5, index: 3, indexDecay: 2.5, help: 'Inharmonic FM bell.' },
  // Strings / pads / brass
  { id: 'strings', name: 'STRINGS', group: 'ENSEMBLE', kind: 'table', partials: (h) => 1 / Math.pow(h, 1.15) * (1 + 0.5 * Math.exp(-((h - 6) ** 2) / 8)), help: 'String ensemble spectrum. Slow attack and a little chorus make a classic string machine.' },
  { id: 'brass', name: 'BRASS', group: 'ENSEMBLE', kind: 'table', partials: (h) => (1 / Math.pow(h, 0.85)) * (1 + Math.exp(-((h - 5) ** 2) / 6)), help: 'Brassy saw spectrum with a mid formant. Use a filter envelope for the swell.' },
  { id: 'voxa', name: 'VOX AAH', group: 'VOX', kind: 'table', partials: formant([700, 1220, 2600], [130, 120, 200], [1, 0.5, 0.25]), help: 'Choir "aah" formant wave.' },
  { id: 'voxo', name: 'VOX OOH', group: 'VOX', kind: 'table', partials: formant([400, 800, 2600], [100, 100, 200], [1, 0.4, 0.1]), help: 'Choir "ooh" formant wave.' },
  { id: 'voxe', name: 'VOX EEH', group: 'VOX', kind: 'table', partials: formant([300, 2300, 3000], [80, 150, 200], [1, 0.4, 0.3]), help: 'Bright "eeh" formant wave.' },
  { id: 'reed', name: 'REED', group: 'WIND', kind: 'table', partials: (h) => (h % 2 ? 1 / h : 0.05 / h), help: 'Odd-harmonic reed, like a clarinet.' },
  { id: 'flute', name: 'FLUTE', group: 'WIND', kind: 'table', partials: (h) => (h === 1 ? 1 : h === 2 ? 0.2 : h === 3 ? 0.08 : 0.01 / h), help: 'Nearly pure tone with a soft second harmonic.' },
  // Digital
  { id: 'glass', name: 'GLASS', group: 'DIGITAL', kind: 'table', partials: (h) => (Math.sqrt(h) % 1 === 0 ? 1 / Math.sqrt(h) : 0), help: 'Square-number harmonics. Glassy and hollow.' },
  { id: 'hollow', name: 'HOLLOW', group: 'DIGITAL', kind: 'table', partials: (h) => (h === 1 || h === 3 || h === 5 || h === 9 ? 1 / Math.sqrt(h) : 0), help: 'A few strong odd partials.' },
  { id: 'digi1', name: 'DIGITAL 1', group: 'DIGITAL', kind: 'table', partials: digital(7, 0.6), help: 'Random harmonic set. Bright late-80s digital character.' },
  { id: 'digi2', name: 'DIGITAL 2', group: 'DIGITAL', kind: 'table', partials: digital(23, 0.9), help: 'Another random harmonic set, softer.' },
  { id: 'digi3', name: 'DIGITAL 3', group: 'DIGITAL', kind: 'table', partials: digital(101, 0.4), help: 'Harsh random harmonics for FX and stabs.' },
  { id: 'fmbass', name: 'FM BASS', group: 'FM', kind: 'fm', ratio: 1, index: 3, indexDecay: 0.18, help: 'Punchy FM bass with a percussive bite.' },
  { id: 'fmmetal', name: 'FM METAL', group: 'FM', kind: 'fm', ratio: 1.414, index: 4, indexDecay: 0, help: 'Sustained inharmonic FM. Metallic drones and hits.' },
  { id: 'fmsub', name: 'FM SUB', group: 'FM', kind: 'fm', ratio: 0.5, index: 1.5, indexDecay: 0, help: 'Sine with a sub-octave modulator. Growly.' },
  { id: 'fmwood', name: 'FM WOOD', group: 'FM', kind: 'fm', ratio: 2.76, index: 2, indexDecay: 0.05, help: 'Woody FM knock.' },
  // Plucked
  { id: 'pluck', name: 'PLUCK', group: 'PLUCKED', kind: 'pluck', damping: 0.5, help: 'Karplus-Strong plucked string. Wave Param sets pluck brightness.' },
  { id: 'guitar', name: 'GUITAR', group: 'PLUCKED', kind: 'pluck', damping: 0.25, help: 'Longer-ringing plucked string.' },
  { id: 'harp', name: 'HARP', group: 'PLUCKED', kind: 'pluck', damping: 0.12, help: 'Soft, long plucked string.' },
];

export const WAVE_MAP: Record<string, WaveDef> = Object.fromEntries(WAVES.map((w) => [w.id, w]));
export const waveDef = (id: string) => WAVE_MAP[id] ?? WAVE_MAP.saw;

// ---------------------------------------------------------------- wavetables

export const TABLE_SIZE = 2048;
const TABLE_MASK = TABLE_SIZE - 1;
const LEVELS = 11; // 1024 harmonics down to 1

const sineTbl = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) sineTbl[i] = Math.sin((i / TABLE_SIZE) * Math.PI * 2);

/** Mip-mapped band-limited table; level L holds harmonics up to 1024 >> L. */
export class Wavetable {
  levels: Float32Array[] = [];
  constructor(partials: (h: number) => number) {
    const amps: number[] = [];
    for (let h = 1; h < TABLE_SIZE / 2; h++) amps.push(partials(h) || 0);
    for (let l = 0; l < LEVELS; l++) {
      const maxH = Math.max(1, (TABLE_SIZE / 2) >> l);
      const t = new Float32Array(TABLE_SIZE);
      for (let h = 1; h < maxH && h <= amps.length; h++) {
        const a = amps[h - 1];
        if (!a) continue;
        for (let i = 0; i < TABLE_SIZE; i++) t[i] += a * sineTbl[(i * h) & TABLE_MASK];
      }
      this.levels.push(t);
    }
    // normalise using the richest level
    let peak = 0;
    for (const v of this.levels[0]) peak = Math.max(peak, Math.abs(v));
    const g = peak > 0 ? 0.9 / peak : 1;
    for (const t of this.levels) for (let i = 0; i < TABLE_SIZE; i++) t[i] *= g;
  }
  /** Pick a mip level for a frequency so no harmonic passes Nyquist. */
  levelFor(freq: number, sr: number) {
    const allowed = sr / 2 / Math.max(1, freq);
    let l = 0;
    while (l < LEVELS - 1 && (TABLE_SIZE / 2) >> l > allowed) l++;
    return this.levels[l];
  }
}

const tableCache = new Map<string, Wavetable>();
export const getTable = (id: string): Wavetable => {
  let t = tableCache.get(id);
  if (!t) {
    const def = waveDef(id);
    t = new Wavetable(def.partials ?? ((h) => 1 / h));
    tableCache.set(id, t);
  }
  return t;
};

export const readTable = (t: Float32Array, phase: number) => {
  const p = phase * TABLE_SIZE;
  const i = p | 0;
  const f = p - i;
  const a = t[i & TABLE_MASK];
  return a + (t[(i + 1) & TABLE_MASK] - a) * f;
};

export const SINE_TABLE = sineTbl;
export const fastSin = (phase: number) => readTable(sineTbl, phase - Math.floor(phase));
