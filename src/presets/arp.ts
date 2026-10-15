// Arpeggiator styles and beat patterns. A style turns the held notes into a list of steps;
// a beat pattern decides which clock steps actually play.

export interface ArpStep {
  notes: number[]; // empty = rest
  vel: number; // velocity factor 0..1
}

export interface ArpStyle {
  id: string;
  name: string;
  help: string;
  random?: boolean;
  build: (sorted: number[], order: number[], octaves: number) => ArpStep[];
}

const expand = (notes: number[], octaves: number) => {
  const n = Math.max(1, Math.abs(octaves || 1));
  const dir = octaves < 0 ? -1 : 1;
  const out: number[] = [];
  for (let o = 0; o < n; o++) for (const x of notes) out.push(x + dir * 12 * o);
  return dir < 0 ? out.sort((a, b) => a - b) : out;
};
const step = (notes: number[], vel = 1): ArpStep => ({ notes, vel });
const single = (list: number[]) => list.map((n) => step([n]));

export const ARP_STYLES: ArpStyle[] = [
  { id: 'up', name: 'UP', help: 'Plays held notes from lowest to highest across the octave range.', build: (s, _o, oc) => single(expand(s, oc)) },
  { id: 'down', name: 'DOWN', help: 'Plays held notes from highest to lowest.', build: (s, _o, oc) => single(expand(s, oc).reverse()) },
  {
    id: 'updown', name: 'UP&DOWN', help: 'Up then down without repeating the top and bottom notes.',
    build: (s, _o, oc) => {
      const u = expand(s, oc);
      return single(u.length < 3 ? u : [...u, ...u.slice(1, -1).reverse()]);
    },
  },
  {
    id: 'updown2', name: 'UP&DOWN 2', help: 'Up then down, repeating the top and bottom notes.',
    build: (s, _o, oc) => {
      const u = expand(s, oc);
      return single([...u, ...[...u].reverse()]);
    },
  },
  { id: 'random', name: 'RANDOM', help: 'Picks a held note at random on every step.', random: true, build: (s, _o, oc) => single(expand(s, oc)) },
  { id: 'order', name: 'NOTE ORDER', help: 'Plays notes in the order you pressed them.', build: (_s, o, oc) => single(expand(o, oc)) },
  {
    id: 'chord', name: 'CHORD', help: 'Plays the whole chord on every step, one octave per step.',
    build: (s, _o, oc) => {
      const n = Math.max(1, Math.abs(oc || 1));
      const dir = oc < 0 ? -1 : 1;
      return Array.from({ length: n }, (_, i) => step(s.map((x) => x + dir * 12 * i)));
    },
  },
  {
    id: 'bassUp', name: 'BASS+UP', help: 'Alternates the lowest note with the rest going up.',
    build: (s, _o, oc) => {
      if (s.length < 2) return single(expand(s, oc));
      const [b, ...rest] = s;
      return expand(rest, oc).flatMap((n) => [step([b], 1), step([n], 0.8)]);
    },
  },
  {
    id: 'bassChord', name: 'BASS+CHORD', help: 'Bass note, then the rest of the chord.',
    build: (s) => (s.length < 2 ? single(s) : [step([s[0]]), step(s.slice(1), 0.8)]),
  },
  {
    id: 'gliss', name: 'GLISSANDO', help: 'Chromatic run between the lowest and highest held note.',
    build: (s, _o, oc) => {
      const e = expand(s, oc);
      const lo = e[0];
      const hi = e[e.length - 1];
      const out: number[] = [];
      for (let n = lo; n <= hi; n++) out.push(n);
      return single(out.length ? out : [lo]);
    },
  },
  {
    id: 'echo', name: 'ECHO', help: 'Each note repeats three times, fading like an echo.',
    build: (s, _o, oc) => expand(s, oc).flatMap((n) => [step([n], 1), step([n], 0.55), step([n], 0.3)]),
  },
  {
    id: 'walk', name: 'WALK BASS', help: 'Root, fifth, octave, fifth from the lowest held note.',
    build: (s) => {
      const r = s[0];
      return [step([r]), step([r + 7], 0.8), step([r + 12], 0.9), step([r + 7], 0.8)];
    },
  },
  {
    id: 'synBass', name: 'SYN BASS', help: 'Octave-jumping bass from the lowest held note.',
    build: (s) => {
      const r = s[0];
      return [step([r]), step([r + 12], 0.7), step([r], 0.9), step([r + 12], 0.7)];
    },
  },
  { id: 'ska', name: 'SKA COMP', help: 'Offbeat chord stabs.', build: (s) => [step([], 0), step(s, 1)] },
  { id: 'waltz', name: 'WALTZ', help: 'Bass then two chords, in threes.', build: (s) => [step([s[0]]), step(s.slice(1).length ? s.slice(1) : s, 0.7), step(s.slice(1).length ? s.slice(1) : s, 0.7)] },
  {
    id: 'stab332', name: '3-3-2 STAB', help: 'Chord stabs in a 3-3-2 rhythm, a staple of house and trance.',
    build: (s) => [step(s), step([], 0), step([], 0), step(s, 0.85), step([], 0), step([], 0), step(s, 0.9), step([], 0)],
  },
  {
    id: 'trance', name: 'TRANCE GATE', help: 'Repeating chord with an accented gate rhythm.',
    build: (s) => [1, 0.5, 0.8, 0.5, 1, 0.5, 0.8, 0.9].map((v) => step(s, v)),
  },
];

export const ARP_MAP = Object.fromEntries(ARP_STYLES.map((s) => [s.id, s]));

export interface BeatPattern { id: string; name: string; mask: string; help: string }
// x = play, X = play accented, . = rest
export const BEAT_PATTERNS: BeatPattern[] = [
  { id: 'all', name: 'ALL STEPS', mask: 'X', help: 'Every step plays.' },
  { id: 'accent4', name: 'ACCENT 4', mask: 'Xxxx', help: 'Every step plays, first of each four accented.' },
  { id: 'off', name: 'OFFBEAT', mask: '.x', help: 'Only offbeat steps play.' },
  { id: 'gallop', name: 'GALLOP', mask: 'X.xx', help: 'Galloping eighth-sixteenth-sixteenth.' },
  { id: '332', name: '3-3-2', mask: 'X..x..x.', help: 'Tresillo rhythm.' },
  { id: 'sparse', name: 'SPARSE', mask: 'X...x.x.', help: 'Sparse syncopated pattern.' },
  { id: 'synco', name: 'SYNCOPATE', mask: 'X.x.xx.x', help: 'Syncopated sixteenths.' },
  { id: 'trance', name: 'TRANCE', mask: 'X.xxX.xx', help: 'Classic trance gate rhythm.' },
  { id: 'broken', name: 'BROKEN', mask: 'Xx.x.xx.x.xx.x..', help: 'Broken-beat sixteenth pattern.' },
  { id: 'dotted', name: 'DOTTED', mask: 'X..x..x..x..x..x', help: 'Dotted-eighth pulse against the bar.' },
];
export const BEAT_MAP = Object.fromEntries(BEAT_PATTERNS.map((b) => [b.id, b]));

export const ARP_RATE_TICKS: Record<string, number> = {
  '1/4': 96, '1/6': 64, '1/8': 48, '1/12': 32, '1/16': 24, '1/24': 16, '1/32': 12,
};
