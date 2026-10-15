// Web MIDI: note/CC input routed to parts, sequencer output, clock in/out.

import { useSyncExternalStore } from 'react';
import { audio } from '../engine/audio';
import { getState, noteOn, noteOff, onMidiOut, play, stop, setTempo, status, getTransport } from '../store/store';
import { lsGet, lsSet } from '../store/persist';

interface MidiState { supported: boolean; inputs: { id: string; name: string }[]; outputs: { id: string; name: string }[]; error: string }
let mstate: MidiState = { supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator, inputs: [], outputs: [], error: '' };
const ls = new Set<() => void>();
const set = (p: Partial<MidiState>) => {
  mstate = { ...mstate, ...p };
  for (const l of ls) l();
};
export const useMidi = () => useSyncExternalStore((cb) => { ls.add(cb); return () => ls.delete(cb); }, () => mstate, () => mstate);

let access: MIDIAccess | null = null;
const clockTimes: number[] = [];

const routePart = (ch: number) => {
  const s = getState();
  if (s.project.system.midi.inMode === 'current') return s.part;
  const idx = s.current.parts.findIndex((p) => p.midiCh - 1 === ch);
  return idx >= 0 ? idx : -1;
};

const onMessage = (e: MIDIMessageEvent) => {
  const d = e.data;
  if (!d || !d.length) return;
  const sys = getState().project.system.midi;
  const s = d[0];
  if (s >= 0xf8) {
    if (!sys.clockIn) return;
    if (s === 0xf8) {
      clockTimes.push(e.timeStamp);
      if (clockTimes.length > 48) clockTimes.shift();
      if (clockTimes.length >= 24) {
        const span = clockTimes[clockTimes.length - 1] - clockTimes[0];
        const bpm = 60000 / ((span / (clockTimes.length - 1)) * 24);
        if (Number.isFinite(bpm) && Math.abs(bpm - getState().current.tempo) > 0.4) setTempo(Math.round(bpm * 10) / 10);
      }
    } else if (s === 0xfa || s === 0xfb) {
      if (!getTransport().playing) void play();
    } else if (s === 0xfc) stop();
    return;
  }
  const type = s & 0xf0;
  const ch = s & 15;
  const part = routePart(ch);
  if (part < 0) return;
  if (type === 0x90 && d[2] > 0) noteOn(part, d[1], d[2]);
  else if (type === 0x80 || (type === 0x90 && d[2] === 0)) noteOff(part, d[1]);
  else if (type === 0xb0) audio.send({ type: 'cc', part, cc: d[1], value: d[2], record: true });
  else if (type === 0xe0) audio.send({ type: 'bend', part, value: ((d[2] << 7) | d[1]) - 8192, record: true });
};

const refresh = () => {
  if (!access) return;
  const inputs: MidiState['inputs'] = [];
  const outputs: MidiState['outputs'] = [];
  const want = getState().project.system.midi.inputId;
  access.inputs.forEach((inp) => {
    inputs.push({ id: inp.id, name: inp.name ?? inp.id });
    inp.onmidimessage = !want || want === inp.id ? onMessage : null;
  });
  access.outputs.forEach((o) => outputs.push({ id: o.id, name: o.name ?? o.id }));
  set({ inputs, outputs });
};

/** Request MIDI access. Without `userAsked`, only reconnects if the user enabled MIDI before (avoids a permission prompt on load). */
export const initMidi = async (userAsked = false) => {
  if (!mstate.supported || access) return;
  if (!userAsked && lsGet('midiEnabled') !== '1') return;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    lsSet('midiEnabled', '1');
    access.onstatechange = refresh;
    refresh();
    if (mstate.inputs.length) status(`MIDI: ${mstate.inputs.map((i) => i.name).join(', ')}`);
  } catch (err) {
    set({ error: String(err) });
  }
};

export const applyMidiSettings = () => refresh();

onMidiOut((frame, events) => {
  const id = getState().project.system.midi.outputId;
  if (!access || !id) return;
  const out = access.outputs.get(id);
  if (!out) return;
  for (const [off, data] of events) {
    try {
      out.send(data, audio.frameToPerf(frame + off));
    } catch {
      /* ignore malformed */
    }
  }
});
