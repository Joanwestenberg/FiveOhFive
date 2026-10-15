// Phone layout pieces: bottom tab bar, the "more" sheet and the drawer backdrop.
import type { ReactElement } from 'react';
import { Icon } from './icons';
import { useApp, setState, undo, redo, panic, type ViewId } from '../store/store';

const S = (d: ReactElement) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const NAV_ICONS = {
  browse: S(<path d="M2 3.5h12M2 8h12M2 12.5h7" />),
  perform: S(<g><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></g>),
  sequencer: S(<path d="M2 3h4M7 6h5M3 9h3M9 12h5M2 14h12" />),
  edit: S(<path d="M3 13c2-6 4-10 5-10s1 4 2 6 2 4 3 4" />),
  more: S(<g><circle cx="3.5" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="12.5" cy="8" r="1" fill="currentColor" /></g>),
};

export const BottomNav = () => {
  const view = useApp((s) => s.view);
  const drawer = useApp((s) => s.drawer);
  const part = useApp((s) => s.part);
  const editView: ViewId = part === 0 ? 'rhythm' : 'patch';
  const go = (v: ViewId) => setState({ view: v, drawer: 'none' });
  const items: { id: string; label: string; icon: ReactElement; on: boolean; run: () => void }[] = [
    { id: 'browse', label: 'Browse', icon: NAV_ICONS.browse, on: drawer === 'browse', run: () => setState({ drawer: drawer === 'browse' ? 'none' : 'browse' }) },
    { id: 'perform', label: 'Perform', icon: NAV_ICONS.perform, on: drawer === 'none' && view === 'perform', run: () => go('perform') },
    { id: 'sequencer', label: 'Sequence', icon: NAV_ICONS.sequencer, on: drawer === 'none' && view === 'sequencer', run: () => go('sequencer') },
    { id: 'edit', label: part === 0 ? 'Kit' : 'Sound', icon: NAV_ICONS.edit, on: drawer === 'none' && (view === 'patch' || view === 'rhythm'), run: () => go(editView) },
    { id: 'more', label: 'More', icon: NAV_ICONS.more, on: drawer === 'more' || (drawer === 'none' && ['mixer', 'effects', 'arp', 'song', 'system'].includes(view)), run: () => setState({ drawer: drawer === 'more' ? 'none' : 'more' }) },
  ];
  return (
    <nav className="bottomnav" aria-label="Sections">
      {items.map((it) => (
        <button key={it.id} type="button" className={`bn${it.on ? ' on' : ''}`} onClick={it.run} aria-pressed={it.on}>
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
};

const MORE_VIEWS: { id: ViewId; label: string; help: string }[] = [
  { id: 'mixer', label: 'Mixer', help: 'Levels, pans, sends and mutes' },
  { id: 'effects', label: 'Effects', help: 'Multi-effect, reverb and delay' },
  { id: 'arp', label: 'Arp / RPS', help: 'Arpeggiator and phrase pads' },
  { id: 'song', label: 'Song', help: 'Chain patterns into songs' },
  { id: 'patch', label: 'Patch', help: 'Synth patch of the selected part' },
  { id: 'rhythm', label: 'Rhythm', help: 'Drum kit of part R' },
  { id: 'system', label: 'System', help: 'MIDI, files and settings' },
];

export const MoreSheet = () => {
  const drawer = useApp((s) => s.drawer);
  const view = useApp((s) => s.view);
  const theme = useApp((s) => s.theme);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  if (drawer !== 'more') return null;
  return (
    <div className="sheet" role="dialog" aria-label="More">
      <div className="sheet-grid">
        {MORE_VIEWS.map((v) => (
          <button key={v.id} type="button" className={`sheet-item${view === v.id ? ' on' : ''}`} onClick={() => setState({ view: v.id, drawer: 'none' })}>
            <span className="t">{v.label}</span>
            <span className="h">{v.help}</span>
          </button>
        ))}
      </div>
      <div className="row gap4 wrap" style={{ marginTop: 8 }}>
        <button type="button" className="btn" disabled={!canUndo} onClick={undo}>{Icon.undo} UNDO</button>
        <button type="button" className="btn" disabled={!canRedo} onClick={redo}>{Icon.redo} REDO</button>
        <button type="button" className="btn" onClick={() => setState({ theme: theme === 'dark' ? 'light' : 'dark' })}>{theme === 'dark' ? Icon.sun : Icon.moon} {theme === 'dark' ? 'LIGHT' : 'DARK'}</button>
        <button type="button" className="btn" onClick={panic}>{Icon.panic} PANIC</button>
      </div>
    </div>
  );
};

export const Backdrop = () => {
  const drawer = useApp((s) => s.drawer);
  if (drawer === 'none') return null;
  return <div className="backdrop" onClick={() => setState({ drawer: 'none' })} />;
};
