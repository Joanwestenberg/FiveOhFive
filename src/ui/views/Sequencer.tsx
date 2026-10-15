import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, NumBox, Section, Select, Seg } from '../widgets/widgets';
import {
  useApp, setState, edit, setIn, getState, getTransport, noteOn, noteOff, setSystem, setLength,
} from '../../store/store';
import type { NoteEv, Pattern, SeqEv } from '../../model/types';
import { NUM_PARTS } from '../../model/types';
import { measureTicks, partName, patternTicks } from '../../model/defaults';
import { noteName } from '../../model/notation';
import {
  GRID_TICKS, copyMeasures, fmtTick, grooveQuantize, insertEvents, quantize, scaleVelocity, shiftTime, shuffleQuantize, sortEvs, transpose, setGate,
} from '../../model/edit';
import { GROOVES } from '../../presets/grooves';
import { Icon } from '../icons';

type Mode = 'roll' | 'grid' | 'list';
const SNAPS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', '1/64'];
const ROW_H = 12;

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const greyFor = (v: number, lo: string, hi: string) => {
  // blend between two hex greys by velocity
  const a = parseInt(lo.slice(1, 3), 16);
  const b = parseInt(hi.slice(1, 3), 16);
  const t = Math.max(0, Math.min(1, (v - 20) / 107));
  const c = Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${c}${c}${c}`;
};

interface RollProps {
  part: number;
  pattern: Pattern;
  snap: number;
  sel: Set<SeqEv>;
  setSel: (s: Set<SeqEv>) => void;
  zoom: number;
}

const PianoRoll = ({ part, pattern, snap, sel, setSel, zoom }: RollProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const len = patternTicks(pattern);
  const bar = measureTicks(pattern);
  const isDrum = part === 0;
  const track = pattern.tracks[part];
  const rows: { note: number; label: string; black?: boolean }[] = useMemo(() => {
    if (isDrum) {
      const notes = new Set(pattern.kit.insts.map((d) => d.note));
      for (const e of track) if (e.k === 'n') notes.add(e.n);
      return [...notes].sort((a, b) => b - a).map((n) => ({ note: n, label: `${n} ${pattern.kit.insts.find((d) => d.note === n)?.name ?? ''}` }));
    }
    return Array.from({ length: 96 }, (_, i) => {
      const n = 107 - i;
      return { note: n, label: n % 12 === 0 ? noteName(n) : '', black: [1, 3, 6, 8, 10].includes(n % 12) };
    });
  }, [isDrum, pattern.kit, track]);
  const rowOf = useMemo(() => new Map(rows.map((r, i) => [r.note, i])), [rows]);
  const gutter = isDrum ? 116 : 40;
  const pxPerTick = Math.max(0.05, ((width - gutter - 4) / len) * zoom);
  const totalW = gutter + len * pxPerTick + 2;
  const totalH = rows.length * ROW_H;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // scroll to the notes on part change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const notes = track.filter((e): e is NoteEv => e.k === 'n');
    const n = notes.length ? notes.reduce((a, e) => a + e.n, 0) / notes.length : 60;
    const r = rowOf.get(Math.round(n)) ?? rows.length / 2;
    el.scrollTop = Math.max(0, r * ROW_H - el.clientHeight / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  const xOf = (t: number) => gutter + t * pxPerTick;

  // draw static content
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = devicePixelRatio;
    c.width = totalW * dpr;
    c.height = totalH * dpr;
    c.style.width = `${totalW}px`;
    c.style.height = `${totalH}px`;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const [bg, panel, panel2, panel3, line, line2, text, dim, faint, hi] = ['--bg', '--panel', '--panel2', '--panel3', '--line', '--line2', '--text', '--dim', '--faint', '--hi'].map(cssVar);
    g.fillStyle = bg;
    g.fillRect(0, 0, totalW, totalH);
    rows.forEach((r, i) => {
      if (r.black || (isDrum && i % 2)) {
        g.fillStyle = panel;
        g.fillRect(gutter, i * ROW_H, totalW - gutter, ROW_H);
      }
      if (!isDrum && r.note % 12 === 0) {
        g.fillStyle = line;
        g.fillRect(gutter, (i + 1) * ROW_H - 1, totalW - gutter, 1);
      }
    });
    // vertical grid
    for (let t = 0; t <= len; t += snap) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = t % bar === 0 ? line2 : t % 96 === 0 ? line : panel2;
      if (pxPerTick * snap < 3 && t % 96 !== 0) continue;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, totalH);
      g.stroke();
    }
    // notes
    for (const e of track) {
      if (e.k !== 'n') continue;
      const r = rowOf.get(e.n);
      if (r === undefined) continue;
      const x = xOf(e.t);
      const w = Math.max(2, (isDrum ? Math.min(e.g, snap) : e.g) * pxPerTick - 1);
      const y = r * ROW_H + 1;
      const selected = sel.has(e);
      g.fillStyle = selected ? hi : greyFor(e.v, dim.length === 7 ? dim : '#8c8c8c', text.length === 7 ? text : '#d6d6d6');
      g.fillRect(x, y, w, ROW_H - 2);
      // wrap-around tail
      if (!isDrum && e.t + e.g > len) {
        g.fillRect(xOf(0), y, (e.t + e.g - len) * pxPerTick, ROW_H - 2);
      }
      if (selected) {
        g.strokeStyle = bg;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, ROW_H - 3);
      }
    }
    // gutter
    g.fillStyle = panel3;
    g.fillRect(0, 0, gutter, totalH);
    g.fillStyle = line;
    g.fillRect(gutter - 1, 0, 1, totalH);
    g.font = `9.5px ${cssVar('--mono') || 'monospace'}`;
    g.textBaseline = 'middle';
    rows.forEach((r, i) => {
      if (!isDrum && r.black) {
        g.fillStyle = panel;
        g.fillRect(0, i * ROW_H, gutter * 0.6, ROW_H);
      }
      if (r.label) {
        g.fillStyle = isDrum ? dim : faint;
        g.fillText(r.label.slice(0, 18), 4, i * ROW_H + ROW_H / 2 + 0.5);
      }
    });
  }, [track, rows, rowOf, totalW, totalH, pxPerTick, snap, sel, isDrum, len, bar, gutter]);

  // velocity lane
  useEffect(() => {
    const c = velRef.current;
    if (!c) return;
    const dpr = devicePixelRatio;
    const h = 56;
    c.width = totalW * dpr;
    c.height = h * dpr;
    c.style.width = `${totalW}px`;
    c.style.height = `${h}px`;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = cssVar('--bg');
    g.fillRect(0, 0, totalW, h);
    g.fillStyle = cssVar('--panel3');
    g.fillRect(0, 0, gutter, h);
    g.fillStyle = cssVar('--faint');
    g.font = '9px sans-serif';
    g.fillText('VELOCITY', 4, 12);
    for (const e of track) {
      if (e.k !== 'n') continue;
      const x = xOf(e.t);
      const bh = (e.v / 127) * (h - 6);
      g.fillStyle = sel.has(e) ? cssVar('--hi') : cssVar('--dim');
      g.fillRect(x, h - bh, Math.max(2, Math.min(6, snap * pxPerTick - 1)), bh);
    }
  }, [track, totalW, pxPerTick, sel, gutter, snap]);

  // On touch, a drag that starts on a note edits it; anywhere else it scrolls the roll.
  const hitRef = useRef<(x: number, y: number) => unknown>(() => null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onTouch = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!t || ev.touches.length > 1) return;
      const r = c.getBoundingClientRect();
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      edgePx.current = 14;
      if (x >= gutter && hitRef.current(x, y)) ev.preventDefault();
    };
    c.addEventListener('touchstart', onTouch, { passive: false });
    return () => c.removeEventListener('touchstart', onTouch);
  }, [gutter]);

  // playhead
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const tr = getTransport();
      const el = headRef.current;
      if (!el) return;
      if (!tr.playing || tr.tick < 0) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.transform = `translateX(${xOf(tr.tick % len)}px)`;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });

  // interaction
  const drag = useRef<null | {
    kind: 'move' | 'resize' | 'create' | 'band' | 'vel';
    x0: number; y0: number; t0: number; n0: number;
    orig: SeqEv[]; picked: NoteEv[]; band?: { x: number; y: number; w: number; h: number };
  }>(null);
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // read the track at event time so fast successive gestures never act on a stale render
  const liveTrack = () => getState().current.tracks[part];
  const edgePx = useRef(5);
  const hit = (x: number, y: number): { ev: NoteEv; edge: boolean } | null => {
    const track = liveTrack();
    const r = Math.floor(y / ROW_H);
    const note = rows[r]?.note;
    if (note === undefined) return null;
    for (let i = track.length - 1; i >= 0; i--) {
      const e = track[i];
      if (e.k !== 'n' || e.n !== note) continue;
      const x0 = xOf(e.t);
      const w = Math.max(4, (isDrum ? Math.min(e.g, snap) : e.g) * pxPerTick);
      if (x >= x0 && x <= x0 + w) return { ev: e, edge: !isDrum && x >= x0 + w - edgePx.current };
    }
    return null;
  };
  hitRef.current = hit;
  const tickAt = (x: number) => Math.max(0, Math.min(len - 1, (x - gutter) / pxPerTick));
  const commit = (evs: SeqEv[], key = 'roll') => edit((p) => setIn(p, ['tracks', part], sortEvs(evs)), key);
  const audition = (n: number, v = 100) => {
    noteOn(part, n, v);
    setTimeout(() => noteOff(part, n), 160);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const track = liveTrack();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const touch = e.pointerType === 'touch';
    edgePx.current = touch ? 14 : 5;
    if (x < gutter) {
      const r = rows[Math.floor(y / ROW_H)];
      if (r) audition(r.note);
      return;
    }
    const h = hit(x, y);
    if (touch) {
      if (!h) {
        // Empty space on a touchscreen: let the finger scroll the roll; a tap without movement adds a note on release.
        pendingTap.current = { x, y };
        return;
      }
      // double-tap a note to delete it
      const now = performance.now();
      if (lastTap.current && lastTap.current.ev === h.ev && now - lastTap.current.t < 350) {
        lastTap.current = null;
        commit(track.filter((ev) => ev !== h.ev), '');
        return;
      }
      lastTap.current = { ev: h.ev, t: now };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (h && (e.button === 2 || e.altKey)) {
      commit(track.filter((ev) => ev !== h.ev), '');
      return;
    }
    if (e.button !== 0) return;
    if (h) {
      let picked: Set<SeqEv>;
      if (e.shiftKey) {
        picked = new Set(sel);
        if (picked.has(h.ev)) picked.delete(h.ev);
        else picked.add(h.ev);
      } else picked = sel.has(h.ev) ? sel : new Set([h.ev]);
      setSel(picked);
      drag.current = { kind: h.edge ? 'resize' : 'move', x0: x, y0: y, t0: h.ev.t, n0: h.ev.n, orig: track, picked: [...picked].filter((p): p is NoteEv => p.k === 'n') };
      if (!h.edge) audition(h.ev.n, h.ev.v);
      return;
    }
    if (e.shiftKey) {
      drag.current = { kind: 'band', x0: x, y0: y, t0: 0, n0: 0, orig: track, picked: [] };
      return;
    }
    createAt(x, y, true);
  };

  const createAt = (x: number, y: number, dragToLength: boolean) => {
    const track = liveTrack();
    const r = rows[Math.floor(y / ROW_H)];
    if (!r) return;
    const t = Math.floor(tickAt(x) / snap) * snap;
    const g = isDrum ? Math.max(6, Math.round(snap / 2)) : snap;
    const ne: NoteEv = { t, k: 'n', n: r.note, v: 100, g };
    const next = insertEvents(track, [ne]);
    commit(next, '');
    setSel(new Set([ne]));
    audition(r.note);
    if (dragToLength) drag.current = { kind: 'create', x0: x, y0: y, t0: t, n0: r.note, orig: next, picked: [ne] };
  };

  const pendingTap = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<{ ev: SeqEv; t: number } | null>(null);
  const onCancel = () => {
    pendingTap.current = null;
    drag.current = null;
    setBand(null);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) {
      const rect = e.currentTarget.getBoundingClientRect();
      const h = hit(e.clientX - rect.left, e.clientY - rect.top);
      e.currentTarget.style.cursor = h ? (h.edge ? 'ew-resize' : 'grab') : 'crosshair';
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (d.kind === 'band') {
      const b = { x: Math.min(x, d.x0), y: Math.min(y, d.y0), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) };
      d.band = b;
      setBand(b);
      return;
    }
    const dt = Math.round((x - d.x0) / pxPerTick / snap) * snap;
    if (d.kind === 'move') {
      const dr = Math.round((y - d.y0) / ROW_H);
      const moved = d.picked.map((p) => {
        const ri = (rowOf.get(p.n) ?? 0) + dr;
        const nn = rows[Math.max(0, Math.min(rows.length - 1, ri))].note;
        return { ...p, t: ((p.t + dt) % len + len) % len, n: nn };
      });
      const rest = d.orig.filter((ev) => !d.picked.includes(ev as NoteEv));
      commit([...rest, ...moved], 'rolldrag');
      setSel(new Set(moved));
    } else if (d.kind === 'resize' || d.kind === 'create') {
      const resized = d.picked.map((p) => ({ ...p, g: Math.max(isDrum ? 6 : Math.max(3, snap / 4), (d.kind === 'create' ? snap : p.g) + dt) }));
      const rest = d.orig.filter((ev) => !d.picked.includes(ev as NoteEv));
      commit([...rest, ...resized], 'rolldrag');
      setSel(new Set(resized));
    }
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const tap = pendingTap.current;
    pendingTap.current = null;
    if (tap) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (Math.hypot(e.clientX - rect.left - tap.x, e.clientY - rect.top - tap.y) < 8) createAt(tap.x, tap.y, false);
      return;
    }
    const d = drag.current;
    drag.current = null;
    const track = liveTrack();
    if (d?.kind === 'band' && d.band) {
      const b = d.band;
      const picked = track.filter((ev) => {
        if (ev.k !== 'n') return false;
        const r = rowOf.get(ev.n);
        if (r === undefined) return false;
        const x = xOf(ev.t);
        const yy = r * ROW_H + ROW_H / 2;
        return x >= b.x && x <= b.x + b.w && yy >= b.y && yy <= b.y + b.h;
      });
      setSel(new Set(picked));
      setBand(null);
    }
  };

  const onVel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const track = liveTrack();
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind: 'vel', x0: 0, y0: 0, t0: 0, n0: 0, orig: track, picked: [] };
    }
    if (drag.current?.kind !== 'vel') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const v = Math.max(1, Math.min(127, Math.round((1 - (e.clientY - rect.top) / rect.height) * 127)));
    const t = tickAt(x);
    const tol = Math.max(snap / 2, 4 / pxPerTick);
    const next = track.map((ev) => (ev.k === 'n' && Math.abs(ev.t - t) <= tol && (!sel.size || sel.has(ev)) ? { ...ev, v } : ev));
    if (next.some((ev, i) => ev !== track[i])) {
      commit(next, 'vel');
      if (sel.size) setSel(new Set(next.filter((_, i) => sel.has(track[i]))));
    }
  };

  return (
    <div className="col" style={{ gap: 0, minHeight: 0, flex: 1 }}>
      <div ref={scrollRef} className="canvas-wrap" style={{ flex: 1, overflow: 'auto', minHeight: 200, position: 'relative' }} onContextMenu={(e) => e.preventDefault()}
        data-info="Piano roll|Click to add a note, drag to move, drag the right edge to resize, right-click or Alt-click to delete, Shift-drag to select. Click the left gutter to audition.">
        <div style={{ position: 'relative', width: totalW, height: totalH }}>
          <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} />
          <div ref={headRef} style={{ position: 'absolute', top: 0, left: 0, width: 1, height: totalH, background: 'var(--hi)', pointerEvents: 'none' }} />
          {band && <div style={{ position: 'absolute', left: band.x, top: band.y, width: band.w, height: band.h, border: '1px dashed var(--hi)', pointerEvents: 'none' }} />}
        </div>
      </div>
      <div className="canvas-wrap" style={{ overflowX: 'hidden', borderTop: 0 }} data-info="Velocity|Drag up and down across notes to draw their velocities. With notes selected, only those change.">
        <canvas ref={velRef} style={{ touchAction: "none" }} onPointerDown={onVel} onPointerMove={onVel} onPointerUp={() => (drag.current = null)} />
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ step grid

const StepGrid = ({ part, pattern }: { part: number; pattern: Pattern }) => {
  const [page, setPage] = useState(0);
  const [baseOct, setBaseOct] = useState(3);
  const bar = measureTicks(pattern);
  const steps = 16;
  const stepT = bar / steps;
  const barsPer = Math.min(pattern.measures, 2);
  const pages = Math.ceil(pattern.measures / barsPer);
  const pg = Math.min(page, pages - 1);
  const isDrum = part === 0;
  const track = pattern.tracks[part];
  const rows = isDrum
    ? [...pattern.kit.insts].sort((a, b) => a.note - b.note).map((d) => ({ note: d.note, label: `${d.note} ${d.name}` }))
    : Array.from({ length: 13 }, (_, i) => ({ note: (baseOct + 1) * 12 + 12 - i, label: noteName((baseOct + 1) * 12 + 12 - i) }));
  const cols = Array.from({ length: steps * barsPer }, (_, i) => pg * barsPer * bar + i * stepT);
  const at = (note: number, t: number) => track.find((e) => e.k === 'n' && e.n === note && e.t >= t && e.t < t + stepT) as NoteEv | undefined;
  const toggle = (note: number, t: number, e: React.MouseEvent) => {
    const ex = at(note, t);
    let next: SeqEv[];
    if (ex && !e.shiftKey && !e.altKey) next = track.filter((x) => x !== ex);
    else {
      const v = e.shiftKey ? 125 : e.altKey ? 60 : 100;
      next = insertEvents(track.filter((x) => x !== ex), [{ t: Math.round(t), k: 'n', n: note, v, g: Math.round(stepT * (isDrum ? 0.5 : 0.9)) }]);
      noteOn(part, note, v);
      setTimeout(() => noteOff(part, note), 120);
    }
    edit((p) => setIn(p, ['tracks', part], next), '');
  };
  return (
    <div className="col gap4" style={{ minHeight: 0, flex: 1 }}>
      <div className="row gap4">
        <Select value={pg} options={Array.from({ length: pages }, (_, i) => ({ value: i, label: `MEAS ${i * barsPer + 1}–${Math.min(pattern.measures, (i + 1) * barsPer)}` }))} onChange={setPage} info="Page|Which measures the grid shows." />
        {!isDrum && <><span className="label">OCTAVE</span><NumBox value={baseOct} min={0} max={7} onChange={setBaseOct} width={30} info="Octave|Lowest octave shown in the melodic step grid." /></>}
        <span className="dim">Click toggles a step · Shift-click accent · Alt-click ghost note</span>
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        <table className="tbl" style={{ width: 'auto', borderCollapse: 'separate', borderSpacing: 2 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.note}>
                <td style={{ background: 'var(--panel3)', minWidth: 110, cursor: 'pointer' }} onClick={() => { noteOn(part, r.note, 100); setTimeout(() => noteOff(part, r.note), 150); }} data-info={`${r.label}|Click to audition.`}>{r.label}</td>
                {cols.map((t, i) => {
                  const ev = at(r.note, t);
                  const v = ev?.v ?? 0;
                  return (
                    <td
                      key={i}
                      onClick={(e) => toggle(r.note, t, e)}
                      style={{
                        width: 20, minWidth: 20, padding: 0, cursor: 'pointer', borderRadius: 2,
                        background: ev ? (v > 110 ? 'var(--hi)' : v < 80 ? 'var(--panel4)' : 'var(--dim)') : i % 4 === 0 ? 'var(--panel3)' : 'var(--panel2)',
                        borderLeft: i % 16 === 0 && i ? '2px solid var(--line2)' : undefined,
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ microscope

const Microscope = ({ part, pattern }: { part: number; pattern: Pattern }) => {
  const bar = measureTicks(pattern);
  const len = patternTicks(pattern);
  const [showMute, setShowMute] = useState(false);
  const track = pattern.tracks[part];
  const update = (i: number, patch: Partial<NoteEv> & Record<string, number>) => {
    const next = track.map((e, k) => (k === i ? ({ ...e, ...patch } as SeqEv) : e));
    edit((p) => setIn(p, ['tracks', part], sortEvs(next)), `ms${i}${Object.keys(patch)[0]}`);
  };
  const remove = (i: number) => edit((p) => setIn(p, ['tracks', part], track.filter((_, k) => k !== i)), '');
  const add = (k: 'n' | 'c' | 'b') => {
    const t = Math.max(0, Math.round(getTransport().tick)) % len;
    const ev: SeqEv = k === 'n' ? { t, k, n: part === 0 ? 36 : 60, v: 100, g: 24 } : k === 'c' ? { t, k, c: 74, v: 64 } : { t, k, v: 0 };
    edit((p) => setIn(p, ['tracks', part], insertEvents(track, [ev])), '');
  };
  if (showMute)
    return (
      <div className="col gap4" style={{ flex: 1, minHeight: 0 }}>
        <div className="row gap4"><Btn onClick={() => setShowMute(false)}>BACK TO PART {partName(part)}</Btn><span className="dim">Mute control track: part mutes switched at set times.</span></div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table className="tbl">
            <thead><tr><th>TIME</th><th>PART</th><th>STATE</th><th /></tr></thead>
            <tbody>
              {pattern.muteTrack.map((m, i) => (
                <tr key={i}>
                  <td className="num">{fmtTick(m.t, bar)}</td>
                  <td>{partName(m.part)}</td>
                  <td>{m.mute ? 'MUTE' : 'ON'}</td>
                  <td><Btn className="icon ghost" onClick={() => edit((p) => ({ ...p, muteTrack: p.muteTrack.filter((_, k) => k !== i) }))}>{Icon.x}</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pattern.muteTrack.length && <div className="empty">No mute events. Record them with the PART MUTE pad mode while recording.</div>}
        </div>
      </div>
    );
  return (
    <div className="col gap4" style={{ flex: 1, minHeight: 0 }}>
      <div className="row gap4">
        <Btn onClick={() => add('n')} info="Add note|Inserts a note at the current position.">{Icon.plus} NOTE</Btn>
        <Btn onClick={() => add('c')} info="Add controller|Inserts a control change (CC) event.">{Icon.plus} CC</Btn>
        <Btn onClick={() => add('b')} info="Add bend|Inserts a pitch bend event.">{Icon.plus} BEND</Btn>
        <Btn onClick={() => setShowMute(true)} info="Mute track|Shows the mute control track.">MUTE TRACK ({pattern.muteTrack.length})</Btn>
        <span className="dim">{track.length} events · CC 74 cutoff, 71 resonance, 73 attack, 72 release, 1 modulation, 7 volume, 10 pan</span>
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        <table className="tbl">
          <thead><tr><th>TIME</th><th>TYPE</th><th>NOTE / CC</th><th>VEL / VALUE</th><th>GATE</th><th /></tr></thead>
          <tbody>
            {track.map((e, i) => (
              <tr key={i}>
                <td><NumBox value={e.t} min={0} max={len - 1} fmt={(v) => fmtTick(v, bar)} onChange={(v) => update(i, { t: v })} width={86} info="Time|Event position (measure-beat-tick). Drag or double-click to type a tick." /></td>
                <td className="dim">{e.k === 'n' ? 'NOTE' : e.k === 'c' ? 'CC' : 'BEND'}</td>
                <td>{e.k === 'n' ? <NumBox value={e.n} min={0} max={127} fmt={(v) => (part === 0 ? `${v} ${pattern.kit.insts.find((d) => d.note === v)?.name ?? ''}` : noteName(v))} onChange={(v) => update(i, { n: v })} width={110} /> : e.k === 'c' ? <NumBox value={e.c} min={0} max={127} onChange={(v) => update(i, { c: v })} width={50} /> : <span className="faint">—</span>}</td>
                <td><NumBox value={e.v} min={e.k === 'b' ? -8192 : 0} max={e.k === 'b' ? 8191 : 127} onChange={(v) => update(i, { v })} width={56} /></td>
                <td>{e.k === 'n' ? <NumBox value={e.g} min={1} max={len * 2} onChange={(v) => update(i, { g: v })} width={56} info="Gate|Note length in ticks (96 per beat)." /> : <span className="faint">—</span>}</td>
                <td><Btn className="icon ghost" onClick={() => remove(i)} info="Delete|Removes this event.">{Icon.x}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!track.length && <div className="empty">No events on this part. Record, use the piano roll or step grid, or ask the assistant.</div>}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ tools

let clipboard: SeqEv[] | null = null;

const Tools = ({ part, pattern, sel, setSel }: { part: number; pattern: Pattern; sel: Set<SeqEv>; setSel: (s: Set<SeqEv>) => void }) => {
  const [qGrid, setQGrid] = useState('1/16');
  const [qStr, setQStr] = useState(100);
  const [shuf, setShuf] = useState(58);
  const [gTpl, setGTpl] = useState('swing58');
  const [gStr, setGStr] = useState(80);
  const [velPct, setVelPct] = useState(110);
  const len = patternTicks(pattern);
  const bar = measureTicks(pattern);
  const track = pattern.tracks[part];
  const sys = useApp((s) => s.project.system);
  // apply to the selection if any, else the whole part
  const apply = (fn: (evs: SeqEv[]) => SeqEv[], label: string) => {
    const target = sel.size ? track.filter((e) => sel.has(e)) : track;
    const rest = sel.size ? track.filter((e) => !sel.has(e)) : [];
    const changed = fn(target);
    edit((p) => setIn(p, ['tracks', part], sortEvs([...rest, ...changed])), '');
    if (sel.size) setSel(new Set(changed));
    setState({ status: `${label} applied to ${sel.size ? `${sel.size} selected events` : `part ${partName(part)}`}.` });
  };
  return (
    <div className="row wrap seq-tools" style={{ gap: 8, alignItems: 'flex-start' }}>
      <Section title="QUANTIZE" info="Quantize|Moves notes to the grid. Works on the selection, or the whole part when nothing is selected.">
        <div className="col gap4">
          <div className="row gap4">
            <Select value={qGrid} options={SNAPS.map((s) => ({ value: s, label: s }))} onChange={setQGrid} info="Grid|Quantize resolution." />
            <NumBox value={qStr} min={0} max={100} onChange={setQStr} width={38} fmt={(v) => `${v}%`} info="Strength|How far notes move toward the grid." />
            <Btn onClick={() => apply((e) => quantize(e, GRID_TICKS[qGrid], qStr, len), 'Grid quantize')} info="Grid quantize|Snaps note starts to the grid.">GRID</Btn>
          </div>
          <div className="row gap4">
            <NumBox value={shuf} min={50} max={75} onChange={setShuf} width={38} fmt={(v) => `${v}%`} info="Shuffle rate|50% is straight; 66% is triplet swing." />
            <Btn onClick={() => apply((e) => shuffleQuantize(e, GRID_TICKS[qGrid], shuf, len), 'Shuffle quantize')} info="Shuffle quantize|Snaps to the grid and swings every second step.">SHUFFLE</Btn>
          </div>
          <div className="row gap4">
            <Select value={gTpl} options={GROOVES.map((g) => ({ value: g.id, label: g.name }))} onChange={setGTpl} info="Groove template|Timing and dynamics template." />
            <NumBox value={gStr} min={0} max={100} onChange={setGStr} width={38} fmt={(v) => `${v}%`} info="Groove strength|How strongly the template applies." />
            <Btn onClick={() => apply((e) => grooveQuantize(e, gTpl, gStr, len), 'Groove quantize')} info="Groove quantize|Applies the template's timing and accents permanently.">GROOVE</Btn>
          </div>
        </div>
      </Section>
      <Section title="TRANSFORM" info="Transform|Edits on the selection, or the whole part when nothing is selected.">
        <div className="col gap4">
          <div className="row gap4">
            <span className="label">TRANSPOSE</span>
            <Btn onClick={() => apply((e) => transpose(e, -12), 'Transpose')}>-12</Btn>
            <Btn onClick={() => apply((e) => transpose(e, -1), 'Transpose')}>-1</Btn>
            <Btn onClick={() => apply((e) => transpose(e, 1), 'Transpose')}>+1</Btn>
            <Btn onClick={() => apply((e) => transpose(e, 12), 'Transpose')}>+12</Btn>
          </div>
          <div className="row gap4">
            <span className="label">SHIFT</span>
            <Btn onClick={() => apply((e) => shiftTime(e, -GRID_TICKS[qGrid], len), 'Shift')} info="Shift left|Moves events one grid step earlier.">{Icon.prev}</Btn>
            <Btn onClick={() => apply((e) => shiftTime(e, -1, len), 'Nudge')} info="Nudge left|Moves events one tick earlier.">-1T</Btn>
            <Btn onClick={() => apply((e) => shiftTime(e, 1, len), 'Nudge')} info="Nudge right|Moves events one tick later.">+1T</Btn>
            <Btn onClick={() => apply((e) => shiftTime(e, GRID_TICKS[qGrid], len), 'Shift')} info="Shift right|Moves events one grid step later.">{Icon.next}</Btn>
          </div>
          <div className="row gap4">
            <span className="label">VELOCITY</span>
            <NumBox value={velPct} min={10} max={200} onChange={setVelPct} width={40} fmt={(v) => `${v}%`} />
            <Btn onClick={() => apply((e) => scaleVelocity(e, velPct), 'Velocity')} info="Scale velocity|Multiplies velocities by the percentage.">APPLY</Btn>
            <Btn onClick={() => apply((e) => setGate(e, { percent: 50 }), 'Gate')} info="Halve gates|Shortens notes to half length.">GATE ½</Btn>
            <Btn onClick={() => apply((e) => setGate(e, { percent: 200 }), 'Gate')} info="Double gates|Lengthens notes to twice their length.">GATE ×2</Btn>
          </div>
        </div>
      </Section>
      <Section title="PART" info="Part edits|Whole-part operations.">
        <div className="col gap4">
          <div className="row gap4">
            <Btn onClick={() => { clipboard = (sel.size ? track.filter((e) => sel.has(e)) : track).map((e) => ({ ...e })); setState({ status: `Copied ${clipboard.length} events.` }); }} info="Copy|Copies the selection (or the whole part).">{Icon.copy} COPY</Btn>
            <Btn disabled={!clipboard} onClick={() => clipboard && edit((p) => setIn(p, ['tracks', part], insertEvents(track, clipboard!.filter((e) => e.t < len))), '')} info="Paste|Merges copied events into this part at their original positions.">PASTE</Btn>
            <Btn onClick={() => { edit((p) => setIn(p, ['tracks', part], sel.size ? track.filter((e) => !sel.has(e)) : []), ''); setSel(new Set()); }} info="Erase|Deletes the selection, or clears the part.">{Icon.trash} {sel.size ? 'DELETE' : 'CLEAR'}</Btn>
          </div>
          <div className="row gap4">
            <Btn disabled={pattern.measures * 2 > 32} onClick={() => { setLength(pattern.measures * 2, undefined, true); }} info="Double|Doubles the pattern length, repeating every part.">DOUBLE LEN</Btn>
            <Btn disabled={pattern.measures < 2} onClick={() => edit((p) => setIn(p, ['tracks', part], copyMeasures(track, bar, 0, Math.floor(p.measures / 2), Math.floor(p.measures / 2), len)), '')} info="Copy first half|Copies the first half of this part over the second half.">1ST HALF → 2ND</Btn>
          </div>
          <div className="row gap4">
            <Btn onClick={() => setSel(new Set(track))} info="Select all|Selects every event on this part.">SELECT ALL</Btn>
            <Btn onClick={() => setSel(new Set())} info="Select none|Clears the selection.">NONE</Btn>
            <span className="dim">{sel.size} selected</span>
          </div>
        </div>
      </Section>
      <Section title="PLAYBACK GROOVE" info="Playback groove|Non-destructive groove applied while the pattern plays.">
        <div className="col gap4">
          <Select value={pattern.groove.type} options={[{ value: 'off', label: 'OFF' }, ...GROOVES.map((g) => ({ value: g.id, label: g.name }))]} onChange={(type) => edit((p) => ({ ...p, groove: { ...p.groove, type } }))} info="Groove type|Template applied live to every part's timing and dynamics." />
          <div className="row gap4">
            <NumBox value={pattern.groove.strength} min={0} max={100} fmt={(v) => `${v}%`} onChange={(strength) => edit((p) => ({ ...p, groove: { ...p.groove, strength } }), 'gstr')} width={44} info="Groove strength|0-100%." />
            <Seg value={pattern.groove.resolution} options={[{ value: 16, label: '16TH' }, { value: 8, label: '8TH' }]} onChange={(resolution) => edit((p) => ({ ...p, groove: { ...p.groove, resolution } }))} info="Groove resolution|Whether the groove works on 16ths or 8ths." />
          </div>
        </div>
      </Section>
      <Section title="RECORDING" info="Recording|Realtime recording settings.">
        <div className="col gap4">
          <div className="row gap4">
            <span className="label">INPUT Q</span>
            <Select value={sys.inputQuantize} options={['off', '1/32', '1/16T', '1/16', '1/8T', '1/8', '1/4'].map((v) => ({ value: v as typeof sys.inputQuantize, label: v.toUpperCase() }))} onChange={(inputQuantize) => setSystem({ inputQuantize })} info="Input quantize|Snaps recorded notes as they come in." />
          </div>
          <div className="row gap4">
            <Seg value={sys.metronome} options={[{ value: 'off', label: 'OFF' }, { value: 'rec', label: 'REC' }, { value: 'always', label: 'ON' }]} onChange={(metronome) => setSystem({ metronome })} info="Metronome|Click off, only while recording, or always." />
            <Btn on={sys.countIn} onClick={() => setSystem({ countIn: !sys.countIn })} info="Count-in|One measure of click before recording starts.">COUNT-IN</Btn>
          </div>
        </div>
      </Section>
    </div>
  );
};

export const SequencerView = () => {
  const part = useApp((s) => s.part);
  const pattern = useApp((s) => s.current);
  const [mode, setMode] = useState<Mode>('roll');
  const [snap, setSnap] = useState('1/16');
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<Set<SeqEv>>(new Set());
  useEffect(() => setSel(new Set()), [part, pattern.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) {
        const tr = getState().current.tracks[part];
        edit((p) => setIn(p, ['tracks', part], tr.filter((x) => !sel.has(x))), '');
        setSel(new Set());
        e.preventDefault();
      }
      if (e.key === 'Escape') setSel(new Set());
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && mode === 'roll') {
        setSel(new Set(getState().current.tracks[part]));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, part, mode]);
  return (
    <div className="col gap8" style={{ height: '100%' }}>
      <div className="row gap8 wrap">
        <Seg value={part} options={Array.from({ length: NUM_PARTS }, (_, i) => ({ value: i, label: `PART ${partName(i)}` }))} onChange={(p) => setState({ part: p })} info="Part|Which part's track to edit." />
        <Seg value={mode} options={[{ value: 'roll', label: 'PIANO ROLL' }, { value: 'grid', label: 'STEP GRID' }, { value: 'list', label: 'MICROSCOPE' }]} onChange={setMode} info="Editor|Piano roll, TR-REC style step grid, or the Microscope event list." />
        {mode === 'roll' && (
          <>
            <span className="label">SNAP</span>
            <Select value={snap} options={SNAPS.map((s) => ({ value: s, label: s }))} onChange={setSnap} info="Snap|Grid for adding and moving notes." />
            <span className="label">ZOOM</span>
            <Seg value={zoom} options={[{ value: 1, label: 'FIT' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} onChange={setZoom} info="Zoom|Horizontal zoom." />
          </>
        )}
        <span className="dim">{pattern.id} {pattern.name} · {pattern.measures} meas · {pattern.beat.join('/')} · {pattern.tracks[part].length} events</span>
      </div>
      <div className="col" style={{ flex: 1, minHeight: 280 }}>
        {mode === 'roll' && <PianoRoll part={part} pattern={pattern} snap={GRID_TICKS[snap]} sel={sel} setSel={setSel} zoom={zoom} />}
        {mode === 'grid' && <StepGrid part={part} pattern={pattern} />}
        {mode === 'list' && <Microscope part={part} pattern={pattern} />}
      </div>
      <Tools part={part} pattern={pattern} sel={sel} setSel={setSel} />
    </div>
  );
};
