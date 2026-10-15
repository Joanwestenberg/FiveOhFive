import { useEffect } from 'react';
import { ControlBar, InfoView, StatusBar, AudioSplash } from './Shell';
import { Browser } from './Browser';
import { Assistant } from './Assistant';
import { PerformView } from './views/Perform';
import { SequencerView } from './views/Sequencer';
import { PatchView } from './views/PatchEdit';
import { RhythmView } from './views/Rhythm';
import { MixerView, EffectsView } from './views/Mixer';
import { ArpRpsView } from './views/ArpRps';
import { SongView } from './views/Song';
import { SystemView } from './views/System';
import { installInfoListener } from './info';
import {
  useApp, setState, getState, loadProject, startAudio, togglePlay, noteOn, noteOff, undo, redo, toggleRec, type ViewId,
} from '../store/store';
import { initMidi } from '../midi/webmidi';
import { useMobile } from './useMobile';
import { BottomNav, MoreSheet, Backdrop } from './Mobile';
import { PAD_NOTES } from '../presets/kits';

const VIEWS: { id: ViewId; label: string; help: string }[] = [
  { id: 'perform', label: 'Perform', help: 'The front panel: parts, realtime knobs, effects, pads, D-Beam and arpeggiator.' },
  { id: 'sequencer', label: 'Sequencer', help: 'Piano roll, step grid and Microscope event list, with quantize and transform tools.' },
  { id: 'patch', label: 'Patch', help: 'Edit the two-tone synth patch of the selected part.' },
  { id: 'rhythm', label: 'Rhythm', help: 'Edit the drum kit of the rhythm part.' },
  { id: 'mixer', label: 'Mixer', help: 'Levels, pans, sends and mutes for all eight parts.' },
  { id: 'effects', label: 'Effects', help: 'Multi-effect, reverb and delay.' },
  { id: 'arp', label: 'Arp / RPS', help: 'Arpeggiator and Realtime Phrase Sequence.' },
  { id: 'song', label: 'Song', help: 'Chain patterns into songs.' },
  { id: 'system', label: 'System', help: 'MIDI, recording settings, file import/export.' },
];

// Computer keyboard → piano (two rows), like most soft synths.
const KEYMAP: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17 };
const DRUMKEYS = 'asdfghjkqwertyui';

const useKeyboard = () => {
  useEffect(() => {
    const down = new Map<string, [number, number]>();
    const onDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,select,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        if (k === 'y') { e.preventDefault(); redo(); }
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        void startAudio().then(() => togglePlay());
        return;
      }
      if (e.repeat) return;
      if (e.shiftKey && k === 'r') { toggleRec(); return; }
      const s = getState();
      if (/^[1-7]$/.test(e.key)) { setState({ part: Number(e.key) }); return; }
      if (e.key === '`' || e.key === '0') { setState({ part: 0 }); return; }
      if (k === 'z') { setState({ octave: Math.max(0, s.octave - 1), status: `Octave ${Math.max(0, s.octave - 1)}` }); return; }
      if (k === 'x') { setState({ octave: Math.min(8, s.octave + 1), status: `Octave ${Math.min(8, s.octave + 1)}` }); return; }
      let note: number | undefined;
      if (s.part === 0) {
        const i = DRUMKEYS.indexOf(k);
        if (i >= 0) note = PAD_NOTES[i];
      } else if (k in KEYMAP) note = (s.octave + 1) * 12 + KEYMAP[k];
      if (note === undefined) return;
      down.set(k, [s.part, note]);
      noteOn(s.part, note, e.shiftKey ? 125 : 100);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const d = down.get(k);
      if (!d) return;
      down.delete(k);
      noteOff(d[0], d[1]);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);
};

export const App = () => {
  const view = useApp((s) => s.view);
  const asst = useApp((s) => s.assistantOpen);
  const drawer = useApp((s) => s.drawer);
  const mobile = useMobile();
  useKeyboard();
  // each view starts at the top
  useEffect(() => {
    document.querySelector('.view')?.scrollTo(0, 0);
  }, [view]);
  // leaving phone layout closes any phone-only drawer
  useEffect(() => {
    if (!mobile && getState().drawer !== 'none') setState({ drawer: 'none' });
  }, [mobile]);
  useEffect(() => {
    const off = installInfoListener();
    void loadProject();
    void initMidi();
    const first = () => void startAudio();
    window.addEventListener('pointerdown', first, { once: true });
    return () => {
      off();
      window.removeEventListener('pointerdown', first);
    };
  }, []);
  return (
    <div className={`app${mobile ? ' mobile' : ''}${drawer === 'browse' ? ' drawer-open' : ''}`}>
      <ControlBar />
      <Browser />
      <main className="main">
        {!mobile && <nav className="tabs">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`tab${view === v.id ? ' on' : ''}`} onClick={() => setState({ view: v.id })} data-info={`${v.label}|${v.help}`}>
              {v.label}
            </button>
          ))}
        </nav>}
        <div className="view">
          {view === 'perform' && <PerformView />}
          {view === 'sequencer' && <SequencerView />}
          {view === 'patch' && <PatchView />}
          {view === 'rhythm' && <RhythmView />}
          {view === 'mixer' && <MixerView />}
          {view === 'effects' && <EffectsView />}
          {view === 'arp' && <ArpRpsView />}
          {view === 'song' && <SongView />}
          {view === 'system' && <SystemView />}
        </div>
      </main>
      {asst && <Assistant />}
      {!mobile && <InfoView />}
      <StatusBar />
      {mobile && <BottomNav />}
      {mobile && <Backdrop />}
      {mobile && <MoreSheet />}
      <AudioSplash />
    </div>
  );
};
