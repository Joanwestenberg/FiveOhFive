import { useMemo, useState } from 'react';
import { PRESET_PATTERNS } from '../presets/patterns';
import { PRESET_PATCHES } from '../presets/patches';
import { PRESET_KITS } from '../presets/kits';
import {
  useApp, setState, loadPattern, setPatch, setKit, status, revertPreset, deleteUserPattern, savePatternAs, newPattern, getState,
} from '../store/store';
import { Btn } from './widgets/widgets';
import { Icon } from './icons';
import { ContextMenu, type MenuItem } from './Menu';

const TABS = [
  { id: 'patterns', label: 'PATTERNS' },
  { id: 'patches', label: 'PATCHES' },
  { id: 'kits', label: 'KITS' },
  { id: 'songs', label: 'SONGS' },
] as const;

export const Browser = () => {
  const tab = useApp((s) => s.browserTab);
  const [q, setQ] = useState('');
  return (
    <aside className="sidebar">
      <div className="tabs" style={{ padding: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab${tab === t.id ? ' on' : ''}`} style={{ flex: 1, padding: 0 }} onClick={() => setState({ browserTab: t.id })} data-info={`${t.label}|Browse ${t.label.toLowerCase()}.`}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: 4, borderBottom: '1px solid var(--line)' }}>
        <input className="input" style={{ width: '100%' }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-info="Search|Filter the list by name or category." />
      </div>
      {tab === 'patterns' && <PatternList q={q} />}
      {tab === 'patches' && <PatchList q={q} />}
      {tab === 'kits' && <KitList q={q} />}
      {tab === 'songs' && <SongList q={q} />}
    </aside>
  );
};

const match = (q: string, ...s: string[]) => !q || s.some((x) => x.toLowerCase().includes(q.toLowerCase()));

const Group = ({ name, children, count }: { name: string; children: React.ReactNode; count: number }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div className="li-group" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'}&nbsp;{name}<span className="grow" />{count}
      </div>
      {open && children}
    </>
  );
};

const PatternList = ({ q }: { q: string }) => {
  const cur = useApp((s) => s.current.id);
  const queued = useApp((s) => s.queuedId);
  const user = useApp((s) => s.project.user);
  const edits = useApp((s) => s.project.edits);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, typeof PRESET_PATTERNS>();
    for (const p of PRESET_PATTERNS) {
      if (!match(q, p.name, p.genre, p.id)) continue;
      if (!g.has(p.genre)) g.set(p.genre, []);
      g.get(p.genre)!.push(p);
    }
    return g;
  }, [q]);
  const users = Object.values(user).filter((p) => match(q, p.name, p.genre, p.id)).sort((a, b) => a.id.localeCompare(b.id));
  const item = (id: string, name: string, extra = '') => (
    <div
      key={id}
      className={`li${id === cur ? ' on' : ''}`}
      style={queued === id ? { outline: '1px dashed var(--dim)', outlineOffset: -2 } : undefined}
      onClick={() => loadPattern(id)}
      onContextMenu={(e) => {
        e.preventDefault();
        const items: MenuItem[] = [
          { label: 'Load now', run: () => loadPattern(id, { queue: false }) },
          { label: 'Save a copy to user slot', run: () => { loadPattern(id, { queue: false }); savePatternAs(); } },
        ];
        if (edits[id]) items.push({ label: 'Revert to factory', run: () => revertPreset(id) });
        if (id.startsWith('U')) items.push({ label: 'Delete', run: () => deleteUserPattern(id) });
        setMenu({ x: e.clientX, y: e.clientY, items });
      }}
      data-info={`${id} ${name}|Click to play this pattern (switches at the end of the current pattern while playing). Right-click for more.`}
    >
      <span className="num faint">{id}</span>
      <span className="name">{name}{edits[id] ? '*' : ''}</span>
      <span className="dim">{extra}</span>
    </div>
  );
  return (
    <div className="list">
      <div className="row" style={{ padding: 4, gap: 4 }}>
        <Btn info="New pattern|Creates an empty pattern in the next free user slot, keeping the current sounds." onClick={() => newPattern()}>{Icon.plus} NEW</Btn>
        <Btn info="Save as|Saves the current pattern into the next free user slot." onClick={() => savePatternAs()}>{Icon.save} SAVE AS</Btn>
      </div>
      <Group name="USER" count={users.length}>
        {users.length ? users.map((p) => item(p.id, p.name, String(p.tempo))) : <div className="empty">No user patterns yet. Edits to presets are kept automatically; SAVE AS stores a copy here.</div>}
      </Group>
      {[...groups.entries()].map(([g, list]) => (
        <Group key={g} name={g} count={list.length}>
          {list.map((p) => item(p.id, p.name, String(p.tempo)))}
        </Group>
      ))}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
};

const PatchList = ({ q }: { q: string }) => {
  const part = useApp((s) => s.part);
  const ref = useApp((s) => s.current.parts[s.part]?.patchRef);
  const userPatches = useApp((s) => s.project.userPatches);
  const groups = useMemo(() => {
    const g = new Map<string, typeof PRESET_PATCHES>();
    for (const p of PRESET_PATCHES) {
      if (!match(q, p.name, p.category)) continue;
      if (!g.has(p.category)) g.set(p.category, []);
      g.get(p.category)!.push(p);
    }
    return g;
  }, [q]);
  const pick = (p: (typeof PRESET_PATCHES)[number], user = false) => {
    const target = part === 0 ? 1 : part;
    if (part === 0) {
      setState({ part: 1 });
      status('The rhythm part uses kits; the patch went to part 1.');
    }
    setPatch(target, p, user ? `U:${p.name}` : p.name);
  };
  const row = (p: (typeof PRESET_PATCHES)[number], user = false) => (
    <div key={(user ? 'u' : 'p') + p.name} className={`li${ref === (user ? `U:${p.name}` : p.name) ? ' on' : ''}`} onClick={() => pick(p, user)} data-info={`${p.name}|Click to load this patch into part ${part === 0 ? 1 : part}. Play the keyboard (A–K) to audition.`}>
      <span className="name">{p.name}</span>
      <span className="faint">{p.tones[0].wave.toUpperCase()}</span>
    </div>
  );
  return (
    <div className="list">
      <div className="li-group" style={{ position: 'static' }}>LOADS INTO PART {part === 0 ? 1 : part}</div>
      {userPatches.length > 0 && (
        <Group name="USER" count={userPatches.length}>
          {userPatches.filter((p) => match(q, p.name, p.category)).map((p) => row(p, true))}
        </Group>
      )}
      {[...groups.entries()].map(([g, list]) => (
        <Group key={g} name={g} count={list.length}>
          {list.map((p) => row(p))}
        </Group>
      ))}
    </div>
  );
};

const KitList = ({ q }: { q: string }) => {
  const ref = useApp((s) => s.current.kitRef);
  const userKits = useApp((s) => s.project.userKits);
  const row = (k: (typeof PRESET_KITS)[number], user = false) => (
    <div key={(user ? 'u' : 'p') + k.name} className={`li${ref === (user ? `U:${k.name}` : k.name) ? ' on' : ''}`} onClick={() => { setKit(k, user ? `U:${k.name}` : k.name); setState({ part: 0 }); }} data-info={`${k.name}|Click to load this rhythm set into the rhythm part (R).`}>
      <span className="name">{k.name}</span>
      <span className="faint">{k.category}</span>
    </div>
  );
  return (
    <div className="list">
      {userKits.length > 0 && <Group name="USER" count={userKits.length}>{userKits.filter((k) => match(q, k.name)).map((k) => row(k, true))}</Group>}
      <Group name="PRESET" count={PRESET_KITS.length}>{PRESET_KITS.filter((k) => match(q, k.name, k.category)).map((k) => row(k))}</Group>
    </div>
  );
};

const SongList = ({ q }: { q: string }) => {
  const songs = useApp((s) => s.project.songs);
  return (
    <div className="list">
      {songs.filter((s) => match(q, s.name)).map((s) => (
        <div key={s.id} className="li" onClick={() => setState({ view: 'song' })} data-info={`${s.name}|Open the song editor.`}>
          <span className="num faint">{s.id}</span>
          <span className="name">{s.name}</span>
          <span className="dim">{s.steps.length} steps</span>
        </div>
      ))}
      <div style={{ padding: 6 }}>
        <Btn onClick={() => {
          const proj = getState().project;
          const id = `S${String(proj.songs.length + 1).padStart(2, '0')}`;
          setState({ project: { ...proj, songs: [...proj.songs, { id, name: `SONG ${proj.songs.length + 1}`, loop: true, steps: [] }] }, view: 'song' });
        }} info="New song|Creates an empty song (a chain of patterns).">{Icon.plus} NEW SONG</Btn>
      </div>
    </div>
  );
};
