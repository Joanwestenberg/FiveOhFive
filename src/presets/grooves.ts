// Groove templates applied non-destructively at playback (and destructively by Groove Quantize).
// Each template gives a timing offset in ticks (96 PPQN, so a 16th is 24 ticks) and a velocity
// factor for each 16th of one bar. Offsets are scaled by the pattern's groove strength.

export interface GrooveTemplate {
  id: string;
  name: string;
  help: string;
  offsets: number[]; // 16 values, ticks
  vel: number[]; // 16 values, multipliers
}

const rep = (a: number[]) => [...a, ...a, ...a, ...a].slice(0, 16);

export const GROOVES: GrooveTemplate[] = [
  { id: 'shuffle', name: 'SHUFFLE', help: 'Delays every second step. Strength 100 is a full dotted swing.', offsets: rep([0, 12, 0, 12]), vel: rep([1, 0.85, 1, 0.85]) },
  { id: 'swing54', name: 'SWING 54%', help: 'Light swing, like a drum machine set to 54%.', offsets: rep([0, 2, 0, 2]), vel: rep([1, 0.9, 1, 0.9]) },
  { id: 'swing58', name: 'SWING 58%', help: 'Medium swing.', offsets: rep([0, 4, 0, 4]), vel: rep([1, 0.88, 1, 0.88]) },
  { id: 'swing62', name: 'SWING 62%', help: 'Strong swing, a classic hip-hop feel.', offsets: rep([0, 6, 0, 6]), vel: rep([1, 0.85, 1, 0.85]) },
  { id: 'swing66', name: 'SWING 66%', help: 'Triplet swing.', offsets: rep([0, 8, 0, 8]), vel: rep([1, 0.82, 1, 0.82]) },
  { id: 'hiphop', name: 'HIP HOP', help: 'Lazy snare on 2 and 4 with swung hats.', offsets: [0, 6, 0, 6, 4, 6, 0, 6, 0, 6, 0, 6, 4, 6, 0, 6], vel: [1, 0.7, 0.9, 0.7, 1, 0.7, 0.85, 0.7, 1, 0.7, 0.9, 0.7, 1, 0.7, 0.85, 0.7] },
  { id: 'house', name: 'HOUSE', help: 'Slightly pushed offbeats with accented open hats.', offsets: [0, 1, -2, 1, 0, 1, -2, 1, 0, 1, -2, 1, 0, 1, -2, 1], vel: [1, 0.75, 1.05, 0.75, 1, 0.75, 1.05, 0.75, 1, 0.75, 1.05, 0.75, 1, 0.75, 1.05, 0.75] },
  { id: 'funk', name: 'FUNK', help: 'Tight sixteenths with ghost-note dynamics.', offsets: [0, 3, -1, 4, 0, 3, -1, 4, 0, 3, -1, 4, 0, 3, -1, 4], vel: [1, 0.6, 0.8, 0.65, 1, 0.6, 0.85, 0.6, 1, 0.65, 0.8, 0.6, 1, 0.6, 0.9, 0.7] },
  { id: 'reggae', name: 'REGGAE', help: 'Swung eighths with a heavy offbeat.', offsets: rep([0, 0, 10, 0]), vel: rep([0.9, 0.7, 1.1, 0.7]) },
  { id: 'samba', name: 'SAMBA', help: 'Samba lilt: the fourth sixteenth arrives late.', offsets: rep([0, -2, 0, 5]), vel: rep([1, 0.7, 0.8, 0.95]) },
  { id: 'jungle', name: 'JUNGLE', help: 'Rushed breakbeat feel.', offsets: [0, -2, 0, -1, 0, -2, 1, -1, 0, -2, 0, -1, 0, -2, 1, -1], vel: [1, 0.7, 0.85, 0.75, 1.05, 0.7, 0.8, 0.7, 1, 0.7, 0.85, 0.75, 1.05, 0.7, 0.8, 0.7] },
  { id: 'humanize', name: 'HUMANIZE', help: 'Small fixed timing and level variations so loops feel played.', offsets: [0, 1, -1, 2, -1, 1, 0, -2, 1, 0, -1, 2, 0, -1, 1, -1], vel: [1, 0.92, 0.97, 0.9, 1, 0.94, 0.96, 0.9, 1, 0.93, 0.98, 0.91, 1, 0.95, 0.97, 0.92] },
];
export const GROOVE_MAP = Object.fromEntries(GROOVES.map((g) => [g.id, g]));

/** Groove offset (ticks) and velocity factor for an event at tick t. */
export const grooveAt = (groove: { type: string; resolution: 8 | 16; strength: number }, t: number): [number, number] => {
  if (!groove || groove.type === 'off') return [0, 1];
  const tpl = GROOVE_MAP[groove.type];
  if (!tpl) return [0, 1];
  const grid = groove.resolution === 8 ? 48 : 24;
  const idx = Math.round(t / grid);
  const near = idx * grid;
  if (Math.abs(t - near) > grid / 4) return [0, 1];
  const s = groove.strength / 100;
  const k = ((idx % 16) + 16) % 16;
  const scale = groove.resolution === 8 ? 2 : 1;
  return [Math.round(tpl.offsets[k] * s * scale), 1 + (tpl.vel[k] - 1) * s];
};
