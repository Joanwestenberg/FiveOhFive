// Application store. Holds the project (patterns, songs, banks, settings), the working pattern,
// UI selection, and keeps the audio engine in sync by diffing immutable updates.

import { useSyncExternalStore, useRef, useCallback } from 'react';
import type {
  ArpSettings, Kit, Patch, PartSetup, Pattern, RpsSet, SeqEv, Song, SystemSettings, DrumInst,
} from '../model/types';
import { NUM_PARTS } from '../model/types';
import {
  clone, defaultArp, defaultRps, defaultSystem, emptyPattern, measureTicks, patternTicks,
} from '../model/defaults';
import { PRESET_PATTERNS } from '../presets/patterns';
import { audio } from '../engine/audio';
import type { FromEngine, PosInfo, RpsPhrase } from '../engine/messages';
import { kvGet, kvSet, lsGet, lsSet } from './persist';
import { insertEvents, GRID_TICKS, resizeTrack, sortEvs } from '../model/edit';

export type ViewId = 'perform' | 'sequencer' | 'patch' | 'rhythm' | 'mixer' | 'effects' | 'arp' | 'song' | 'system';
export type PadMode = 'keyboard' | 'trrec' | 'rps' | 'mute' | 'megamix';

export interface Project {
  version: 1;
  user: Record<string, Pattern>;
  edits: Record<string, Pattern>;
  userPatches: Patch[];
  userKits: Kit[];
  songs: Song[];
  rps: RpsSet;
  arp: ArpSettings;
  system: SystemSettings;
  currentId: string;
}

export interface AppState {
  project: Project;
  current: Pattern;
  part: number;
  view: ViewId;
  padMode: PadMode;
  octave: number;
  queuedId: string | null;
  song: { id: string; step: number; count: number } | null;
  megaSource: string | null;
  megaParts: boolean[];
  status: string;
  audio: 'off' | 'starting' | 'on' | 'error';
  recArmed: boolean;
  assistantOpen: boolean;
  browserTab: 'patterns' | 'patches' | 'kits' | 'songs';
  theme: 'dark' | 'light';
  canUndo: boolean;
  canRedo: boolean;
  loaded: boolean;
  trPage: number;
  trNote: number;
}

export const USER_SLOTS = 200;
export const userId = (i: number) => `U${String(i + 1).padStart(3, '0')}`;
const PRESET_BY_ID: Record<string, Pattern> = Object.fromEntries(PRESET_PATTERNS.map((p) => [p.id, p]));

const initialProject = (): Project => ({
  version: 1,
  user: {},
  edits: {},
  userPatches: [],
  userKits: [],
  songs: [{ id: 'S01', name: 'SONG 1', loop: true, steps: [{ patternId: 'P001', repeats: 2 }, { patternId: 'P002', repeats: 2 }] }],
  rps: defaultRps(),
  arp: defaultArp(),
  system: defaultSystem(),
  currentId: 'P001',
});

// ------------------------------------------------------------------ transport (high-rate) store

export interface TransportState extends Omit<PosInfo, 'type'> {
  bpmTaps: number[];
}
let transport: TransportState = {
  tick: 0, playing: false, recording: false, patternId: 'P001', meters: new Array(NUM_PARTS).fill(0), master: [0, 0],
  hits: new Array(NUM_PARTS).fill(0), drumHits: [], voices: 0, rpsActive: [], speed: 1, heldArp: 0, bpmTaps: [],
};
const tListeners = new Set<() => void>();
export const getTransport = () => transport;
const setTransport = (t: Partial<TransportState>) => {
  transport = { ...transport, ...t };
  for (const l of tListeners) l();
};
export const useTransport = <T>(sel: (t: TransportState) => T): T => {
  const selRef = useRef(sel);
  selRef.current = sel;
  const get = useCallback(() => selRef.current(transport), []);
  return useSyncExternalStore((cb) => { tListeners.add(cb); return () => tListeners.delete(cb); }, get, get);
};

// ------------------------------------------------------------------ main store

let state: AppState = {
  project: initialProject(),
  current: clone(PRESET_PATTERNS[0]),
  part: 1,
  view: 'perform',
  padMode: 'keyboard',
  octave: 4,
  queuedId: null,
  song: null,
  megaSource: null,
  megaParts: new Array(NUM_PARTS).fill(false),
  status: 'Ready. Click anywhere or press Space to start audio.',
  audio: 'off',
  recArmed: false,
  assistantOpen: lsGet('assistantOpen', '1') === '1',
  browserTab: 'patterns',
  theme: (lsGet('theme', 'dark') as 'dark' | 'light'),
  canUndo: false,
  canRedo: false,
  loaded: false,
  trPage: 0,
  trNote: 36,
};
const listeners = new Set<() => void>();
export const getState = () => state;

const undoStack: { pattern: Pattern; key: string; time: number }[] = [];
const redoStack: Pattern[] = [];
let suppressSync = false;

const emit = () => {
  for (const l of listeners) l();
};

export const setState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
  const prev = state;
  const p = typeof patch === 'function' ? patch(prev) : patch;
  state = { ...prev, ...p };
  if (state.current !== prev.current && !suppressSync) syncPattern(prev.current, state.current);
  if (state.project !== prev.project) {
    if (state.project.arp !== prev.project.arp || state.part !== prev.part) sendArp();
    if (state.project.system !== prev.project.system) audio.send({ type: 'system', sys: state.project.system });
    if (state.project.rps !== prev.project.rps) sendRps();
    scheduleSave();
  } else if (state.part !== prev.part) sendArp();
  if (state.part !== prev.part) audio.send({ type: 'focus', part: state.part });
  if (state.current !== prev.current) {
    storeCurrent();
    scheduleSave();
  }
  if (state.theme !== prev.theme) {
    document.documentElement.dataset.theme = state.theme;
    lsSet('theme', state.theme);
  }
  if (state.assistantOpen !== prev.assistantOpen) lsSet('assistantOpen', state.assistantOpen ? '1' : '0');
  emit();
};

export const useApp = <T>(sel: (s: AppState) => T): T => {
  const selRef = useRef(sel);
  selRef.current = sel;
  const get = useCallback(() => selRef.current(state), []);
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, get, get);
};

export const status = (msg: string) => setState({ status: msg });

// ------------------------------------------------------------------ engine sync

const syncPattern = (prev: Pattern, next: Pattern) => {
  if (prev.id !== next.id) {
    audio.send({ type: 'pattern', pattern: next, mode: 'replace' });
    sendRps();
    return;
  }
  if (prev.tracks !== next.tracks || prev.muteTrack !== next.muteTrack) audio.send({ type: 'tracks', tracks: next.tracks, muteTrack: next.muteTrack });
  if (prev.parts !== next.parts) next.parts.forEach((p, i) => { if (p !== prev.parts[i]) audio.send({ type: 'part', index: i, setup: p }); });
  if (prev.kit !== next.kit) audio.send({ type: 'kit', kit: next.kit });
  if (prev.fx !== next.fx) audio.send({ type: 'fx', fx: next.fx });
  if (prev.groove !== next.groove) audio.send({ type: 'groove', groove: next.groove });
  if (prev.tempo !== next.tempo) audio.send({ type: 'tempo', bpm: next.tempo });
  if (prev.measures !== next.measures || prev.beat !== next.beat) audio.send({ type: 'length', measures: next.measures, beat: next.beat });
};

const sendArp = () => audio.send({ type: 'arp', settings: state.project.arp, part: state.part });

export const rpsPhrases = (set: RpsSet): (RpsPhrase | null)[] =>
  set.slots.map((s) => {
    if (!s) return null;
    const p = s.patternId === state.current.id ? state.current : getPattern(s.patternId);
    if (!p) return null;
    const events = (p.tracks[s.part] ?? []).filter((e) => e.k === 'n' || e.k === 'c');
    return { events: sortEvs(events), length: patternTicks(p), target: s.target };
  });
const sendRps = () => audio.send({ type: 'rps', set: state.project.rps, phrases: rpsPhrases(state.project.rps) });

/** Push the whole state to a freshly started engine. */
const fullSync = () => {
  audio.send({ type: 'system', sys: state.project.system });
  audio.send({ type: 'pattern', pattern: state.current, mode: 'replace' });
  audio.send({ type: 'focus', part: state.part });
  sendArp();
  sendRps();
};

// ------------------------------------------------------------------ patterns

export const getPattern = (id: string): Pattern | undefined => {
  if (id === state.current.id) return state.current;
  if (id.startsWith('U')) return state.project.user[id];
  return state.project.edits[id] ?? PRESET_BY_ID[id];
};
export const isEditedPreset = (id: string) => !!state.project.edits[id];
export const allPatternIds = () => [...PRESET_PATTERNS.map((p) => p.id), ...Object.keys(state.project.user).sort()];

/** Write the working pattern back into the project (user slot or preset edit overlay). */
const storeCurrent = () => {
  const cur = state.current;
  const proj = state.project;
  if (cur.id.startsWith('U')) {
    if (proj.user[cur.id] === cur) return;
    state = { ...state, project: { ...proj, user: { ...proj.user, [cur.id]: cur }, currentId: cur.id } };
  } else {
    if (proj.edits[cur.id] === cur || PRESET_BY_ID[cur.id] === cur) return;
    if (!undoStack.length && !proj.edits[cur.id]) return; // untouched preset
    state = { ...state, project: { ...proj, edits: { ...proj.edits, [cur.id]: cur }, currentId: cur.id } };
  }
};

const resetUndo = () => {
  undoStack.length = 0;
  redoStack.length = 0;
};

export const loadPattern = (id: string, opts: { queue?: boolean } = {}) => {
  const p = getPattern(id);
  if (!p) return status(`Pattern ${id} is empty.`);
  if (opts.queue !== false && transport.playing && id !== state.current.id) {
    audio.send({ type: 'pattern', pattern: clone(p), mode: 'queue' });
    setState({ queuedId: id, status: `Next: ${id} ${p.name} (switches at the end of the pattern)` });
    return;
  }
  resetUndo();
  setState({ current: clone(p), queuedId: null, canUndo: false, canRedo: false, project: { ...state.project, currentId: id }, status: `Loaded ${id} ${p.name}` });
};

export const revertPreset = (id: string) => {
  const edits = { ...state.project.edits };
  delete edits[id];
  setState({ project: { ...state.project, edits } });
  if (state.current.id === id) {
    resetUndo();
    setState({ current: clone(PRESET_BY_ID[id]), canUndo: false, canRedo: false, status: `Reverted ${id} to the factory pattern.` });
  }
};

export const firstFreeUser = () => {
  for (let i = 0; i < USER_SLOTS; i++) if (!state.project.user[userId(i)]) return userId(i);
  return null;
};

export const savePatternAs = (slot?: string, name?: string) => {
  const id = slot ?? firstFreeUser();
  if (!id) return status('All user pattern slots are full.');
  const p = { ...clone(state.current), id, name: (name ?? state.current.name).toUpperCase().slice(0, 16) };
  resetUndo();
  setState({ project: { ...state.project, user: { ...state.project.user, [id]: p }, currentId: id }, current: p, canUndo: false, canRedo: false, status: `Saved as ${id} ${p.name}` });
  return id;
};

export const newPattern = () => {
  const id = firstFreeUser();
  if (!id) return status('All user pattern slots are full.');
  const p = emptyPattern(id, 'NEW PATTERN');
  // keep the current sounds and effects so a new idea starts from the same palette
  p.parts = clone(state.current.parts).map((pt) => ({ ...pt, mute: false }));
  p.kit = clone(state.current.kit);
  p.kitRef = state.current.kitRef;
  p.fx = clone(state.current.fx);
  p.tempo = state.current.tempo;
  resetUndo();
  setState({ project: { ...state.project, user: { ...state.project.user, [id]: p }, currentId: id }, current: p, canUndo: false, canRedo: false, status: `Created ${id}` });
  return id;
};

export const deleteUserPattern = (id: string) => {
  const user = { ...state.project.user };
  delete user[id];
  setState({ project: { ...state.project, user } });
  if (state.current.id === id) loadPattern('P001', { queue: false });
};

// ------------------------------------------------------------------ editing (with undo)

const UNDO_MAX = 100;

/** Apply an edit to the working pattern. `key` coalesces rapid edits (knob drags) into one undo step. */
export const edit = (fn: (p: Pattern) => Pattern, key = '') => {
  const prev = state.current;
  const next = fn(prev);
  if (next === prev) return;
  const now = Date.now();
  const top = undoStack[undoStack.length - 1];
  if (!(key && top && top.key === key && now - top.time < 800)) {
    undoStack.push({ pattern: prev, key, time: now });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  } else top.time = now;
  redoStack.length = 0;
  setState({ current: next, canUndo: true, canRedo: false });
};

export const undo = () => {
  const u = undoStack.pop();
  if (!u) return;
  redoStack.push(state.current);
  setState({ current: u.pattern, canUndo: undoStack.length > 0, canRedo: true, status: 'Undo' });
};
export const redo = () => {
  const r = redoStack.pop();
  if (!r) return;
  undoStack.push({ pattern: state.current, key: '', time: 0 });
  setState({ current: r, canUndo: true, canRedo: redoStack.length > 0, status: 'Redo' });
};
/** Mark an undo checkpoint (e.g. before an agent turn) and return its depth. */
export const undoDepth = () => undoStack.length;
export const undoTo = (depth: number) => {
  while (undoStack.length > depth) undo();
};

type Path = (string | number)[];
/** Immutable set of a nested value. */
export const setIn = <T>(obj: T, path: Path, value: unknown): T => {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const src = obj as unknown as Record<string | number, unknown>;
  const child = src?.[k];
  const nextChild = setIn(child, rest, value);
  if (child === nextChild) return obj;
  if (Array.isArray(obj)) {
    const a = [...obj];
    a[k as number] = nextChild;
    return a as unknown as T;
  }
  return { ...(obj as object), [k]: nextChild } as T;
};
export const getIn = (obj: unknown, path: Path): unknown => path.reduce<unknown>((o, k) => (o == null ? o : (o as Record<string | number, unknown>)[k]), obj);

export const editPath = (path: Path, value: unknown, key?: string) => edit((p) => setIn(p, path, value), key ?? path.join('.'));

export const setPart = (i: number, patch: Partial<PartSetup>, key?: string) =>
  edit((p) => setIn(p, ['parts', i], { ...p.parts[i], ...patch }), key ?? `part${i}:${Object.keys(patch).join(',')}`);

export const setPatch = (i: number, patch: Patch, ref?: string) =>
  edit((p) => setIn(p, ['parts', i], { ...p.parts[i], patch: clone(patch), patchRef: ref ?? patch.name }), `patch${i}:${Date.now()}`);

export const setKit = (kit: Kit, ref?: string) => edit((p) => ({ ...p, kit: clone(kit), kitRef: ref ?? kit.name }), `kit:${Date.now()}`);

export const setDrum = (note: number, patch: Partial<DrumInst>, key?: string) =>
  edit((p) => ({ ...p, kit: { ...p.kit, insts: p.kit.insts.map((d) => (d.note === note ? { ...d, ...patch } : d)) } }), key ?? `drum${note}:${Object.keys(patch).join(',')}`);

export const setTrack = (i: number, events: SeqEv[], key = '') =>
  edit((p) => setIn(p, ['tracks', i], sortEvs(events)), key);

export const setTempo = (bpm: number) => edit((p) => ({ ...p, tempo: Math.max(20, Math.min(300, Math.round(bpm * 10) / 10)) }), 'tempo');

export const setLength = (measures: number, beat?: [number, number], loop = true) =>
  edit((p) => {
    const nb = beat ?? p.beat;
    const oldLen = patternTicks(p);
    const np = { ...p, measures: Math.max(1, Math.min(32, Math.round(measures))), beat: nb };
    const newLen = patternTicks(np);
    np.tracks = p.tracks.map((tr) => resizeTrack(tr, oldLen, newLen, loop));
    np.muteTrack = p.muteTrack.filter((m) => m.t < newLen);
    return np;
  });

// ------------------------------------------------------------------ project-level settings

export const setProject = (patch: Partial<Project>) => setState({ project: { ...state.project, ...patch } });
export const setArp = (patch: Partial<ArpSettings>) => setProject({ arp: { ...state.project.arp, ...patch } });
export const setSystem = (patch: Partial<SystemSettings>) => setProject({ system: { ...state.project.system, ...patch } });
export const setRps = (patch: Partial<RpsSet>) => setProject({ rps: { ...state.project.rps, ...patch } });

export const writeUserPatch = (patch: Patch) => {
  const list = state.project.userPatches.filter((p) => p.name !== patch.name);
  setProject({ userPatches: [...list, clone(patch)] });
  status(`Wrote patch "${patch.name}" to the user bank.`);
};
export const writeUserKit = (kit: Kit) => {
  const list = state.project.userKits.filter((k) => k.name !== kit.name);
  setProject({ userKits: [...list, clone(kit)] });
  status(`Wrote rhythm set "${kit.name}" to the user bank.`);
};

// ------------------------------------------------------------------ transport

export const startAudio = async () => {
  if (state.audio === 'on' || state.audio === 'starting') return;
  setState({ audio: 'starting', status: 'Starting audio engine...' });
  try {
    await audio.start();
    fullSync();
    setState({ audio: 'on', status: `Audio running at ${audio.ctx?.sampleRate} Hz.` });
  } catch (e) {
    setState({ audio: 'error', status: `Audio failed to start: ${String(e)}` });
  }
};

export const play = async () => {
  await startAudio();
  const sys = state.project.system;
  audio.send({ type: 'rec', on: state.recArmed, part: state.part });
  audio.send({ type: 'play', countIn: state.recArmed && sys.countIn });
  if (state.song) setState({ song: { ...state.song, step: state.song.step, count: 0 } });
};
export const stop = (turntable = false) => {
  audio.send({ type: 'stop', turntable });
  setState({ queuedId: null, song: null });
};
export const togglePlay = () => (transport.playing ? stop() : play());
export const toggleRec = () => {
  const on = !state.recArmed;
  setState({ recArmed: on, status: on ? `Recording armed on part ${state.part === 0 ? 'R' : state.part}. Play to record.` : 'Recording off.' });
  audio.send({ type: 'rec', on, part: state.part });
};

export const tapTempo = () => {
  const now = performance.now();
  const taps = [...transport.bpmTaps.filter((t) => now - t < 2500), now];
  setTransport({ bpmTaps: taps });
  if (taps.length >= 3) {
    const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    setTempo(60000 / d);
  }
};

// ------------------------------------------------------------------ live input

const QUANT_TICKS: Record<string, number> = { off: 1, '1/32': 12, '1/16T': 16, '1/16': 24, '1/8T': 32, '1/8': 48, '1/4': 96 };
const held = new Set<string>();

export const noteOn = (part: number, note: number, vel = 100) => {
  if (state.audio !== 'on') void startAudio();
  held.add(`${part}:${note}`);
  audio.send({ type: 'note', part, note, vel });
};
export const noteOff = (part: number, note: number) => {
  held.delete(`${part}:${note}`);
  audio.send({ type: 'note', part, note, vel: 0 });
};
export const sendCc = (part: number, cc: number, value: number) => audio.send({ type: 'cc', part, cc, value: Math.max(0, Math.min(127, Math.round(value))), record: true });
export const sendBend = (part: number, value: number) => audio.send({ type: 'bend', part, value, record: true });
export const panic = () => audio.send({ type: 'panic' });

const onRecorded = (part: number, events: SeqEv[]) => {
  const q = QUANT_TICKS[state.project.system.inputQuantize] ?? 1;
  const len = patternTicks(state.current);
  const evs = events.map((e) => (e.k === 'n' && q > 1 ? { ...e, t: (Math.round(e.t / q) * q) % len } : e));
  edit((p) => setIn(p, ['tracks', part], insertEvents(p.tracks[part], evs)), 'rec');
};

// Realtime erase: while held during recording, events on the record part are removed as the playhead passes.
let eraseHeld = false;
export const setErase = (on: boolean) => {
  eraseHeld = on;
  if (on) status('Erasing on the record part while held.');
};
const eraseBetween = (from: number, to: number) => {
  const part = state.part;
  const len = patternTicks(state.current);
  const a = Math.max(0, Math.floor(from));
  const b = Math.ceil(to) + 1;
  const inRange = (t: number) => (a <= b ? t >= a && t < b : t >= a || t < b % len);
  const tr = state.current.tracks[part];
  if (!tr.some((e) => inRange(e.t))) return;
  edit((p) => setIn(p, ['tracks', part], tr.filter((e) => !inRange(e.t))), 'erase');
};

// ------------------------------------------------------------------ song mode

export const playSong = (songId: string, fromStep = 0) => {
  const song = state.project.songs.find((s) => s.id === songId);
  if (!song || !song.steps.length) return status('Song is empty.');
  const step = song.steps[fromStep];
  stop();
  loadPattern(step.patternId, { queue: false });
  setState({ song: { id: songId, step: fromStep, count: 0 } });
  queueSongNext();
  void play();
};
export const stopSong = () => setState({ song: null });

const songNextStep = () => {
  const s = state.song;
  if (!s) return null;
  const song = state.project.songs.find((x) => x.id === s.id);
  if (!song) return null;
  const next = s.step + 1;
  if (next < song.steps.length) return next;
  return song.loop ? 0 : null;
};
/** Queue the next song step's pattern once the current step is on its final repeat. */
const queueSongNext = () => {
  const s = state.song;
  if (!s) return;
  const song = state.project.songs.find((x) => x.id === s.id);
  if (!song) return;
  const step = song.steps[s.step];
  if (s.count + 1 >= Math.max(1, step.repeats)) {
    const n = songNextStep();
    if (n === null) return;
    const p = getPattern(song.steps[n].patternId);
    if (p) audio.send({ type: 'pattern', pattern: clone(p), mode: 'queue' });
  }
};

const onWrap = (m: { patternId: string; switched: boolean }) => {
  if (m.switched) {
    // the engine already switched; mirror it without re-sending
    const p = getPattern(m.patternId);
    suppressSync = true;
    resetUndo();
    if (p) setState({ current: clone(p), queuedId: null, canUndo: false, canRedo: false, project: { ...state.project, currentId: m.patternId } });
    suppressSync = false;
    sendRps();
  }
  const s = state.song;
  if (!s) return;
  const song = state.project.songs.find((x) => x.id === s.id);
  if (!song) return;
  if (m.switched) {
    const n = songNextStep();
    if (n === null) {
      setState({ song: null });
      return;
    }
    setState({ song: { ...s, step: n, count: 0 } });
  } else {
    const step = song.steps[s.step];
    const count = s.count + 1;
    if (count >= Math.max(1, step.repeats) && songNextStep() === null) {
      stop();
      setState({ song: null, status: 'Song finished.' });
      return;
    }
    setState({ song: { ...s, count } });
  }
  queueSongNext();
};

// ------------------------------------------------------------------ RPS / Megamix

export const rpsPad = (slot: number, on: boolean) => {
  if (state.audio !== 'on') void startAudio();
  audio.send({ type: 'rpsPad', slot, on });
};

export const megamixToggle = (part: number) => {
  const src = state.megaSource ? getPattern(state.megaSource) : null;
  const parts = [...state.megaParts];
  if (parts[part] || !src) {
    parts[part] = false;
    audio.send({ type: 'megamix', part, events: null, length: 0 });
  } else {
    parts[part] = true;
    audio.send({ type: 'megamix', part, events: src.tracks[part], length: patternTicks(src) });
  }
  setState({ megaParts: parts });
};

// ------------------------------------------------------------------ engine messages

const midiOutHandlers = new Set<(frame: number, events: [number, number[]][]) => void>();
export const onMidiOut = (fn: (frame: number, events: [number, number[]][]) => void) => {
  midiOutHandlers.add(fn);
  return () => midiOutHandlers.delete(fn);
};

audio.on((m: FromEngine) => {
  switch (m.type) {
    case 'pos': {
      const { type: _t, ...rest } = m;
      const prevTick = transport.tick;
      setTransport(rest);
      if (eraseHeld && m.recording && m.playing && m.tick >= 0) eraseBetween(prevTick, m.tick);
      break;
    }
    case 'rec':
      onRecorded(m.part, m.events);
      break;
    case 'wrap':
      onWrap(m);
      break;
    case 'stopped':
      setTransport({ playing: false, tick: 0 });
      break;
    case 'midi':
      for (const h of midiOutHandlers) h(m.frame, m.events);
      break;
  }
});

// ------------------------------------------------------------------ persistence

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleSave = () => {
  if (!state.loaded) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void kvSet('project', state.project);
  }, 800);
};

export const loadProject = async () => {
  const saved = await kvGet<Project>('project');
  if (saved && saved.version === 1) {
    const proj: Project = { ...initialProject(), ...saved, system: { ...defaultSystem(), ...saved.system, midi: { ...defaultSystem().midi, ...(saved.system?.midi ?? {}) } }, arp: { ...defaultArp(), ...saved.arp } };
    state = { ...state, project: proj };
    const cur = getPattern(proj.currentId) ?? PRESET_PATTERNS[0];
    suppressSync = true;
    setState({ current: clone(cur) });
    suppressSync = false;
  }
  setState({ loaded: true });
};

export const importProject = (proj: Project) => {
  if (!proj || proj.version !== 1) throw new Error('Not a FiveOhFive project file.');
  state = { ...state, project: { ...initialProject(), ...proj } };
  resetUndo();
  setState({ current: clone(getPattern(proj.currentId) ?? PRESET_PATTERNS[0]), canUndo: false, canRedo: false, status: 'Project imported.' });
  scheduleSave();
};

// ------------------------------------------------------------------ helpers for views

export const barTicksOf = (p: Pattern) => measureTicks(p);
export const lenOf = (p: Pattern) => patternTicks(p);
export const gridTicks = (g: string) => GRID_TICKS[g] ?? 24;
export const heldKeys = held;
