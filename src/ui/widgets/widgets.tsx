// Sedition-style widget kit: knobs, sliders, number boxes, toggles, selects, meters and sections.
// Every control takes an `info` string ("Title|One sentence of help.") shown in the Info View.

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export interface ValueProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  def?: number;
  onChange: (v: number) => void;
  label?: string;
  info?: string;
  fmt?: (v: number) => string;
  disabled?: boolean;
}

const useDrag = (p: ValueProps, pixels: number, axis: 'x' | 'y') => {
  const [active, setActive] = useState(false);
  const st = useRef({ start: 0, val: 0, last: 0 });
  const min = p.min ?? 0;
  const max = p.max ?? 127;
  const step = p.step ?? 1;
  const onPointerDown = (e: React.PointerEvent) => {
    if (p.disabled || e.button !== 0) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    st.current = { start: axis === 'y' ? e.clientY : e.clientX, val: p.value, last: p.value };
    setActive(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!active) return;
    const pos = axis === 'y' ? e.clientY : e.clientX;
    const d = axis === 'y' ? st.current.start - pos : pos - st.current.start;
    const fine = e.shiftKey ? 0.15 : 1;
    const v = clamp(roundTo(st.current.val + (d / pixels) * (max - min) * fine, step), min, max);
    if (v !== st.current.last) {
      st.current.last = v;
      p.onChange(Number(v.toFixed(4)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setActive(false);
  };
  const onDoubleClick = () => {
    if (p.def !== undefined && !p.disabled) p.onChange(p.def);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (p.disabled) return;
    const big = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); p.onChange(clamp(p.value + step * big, min, max)); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); p.onChange(clamp(p.value - step * big, min, max)); }
  };
  return { active, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick, onKeyDown } };
};

const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export const Knob = (p: ValueProps & { size?: number; bipolar?: boolean; lg?: boolean; style?: CSSProperties }) => {
  const min = p.min ?? 0;
  const max = p.max ?? 127;
  const { active, handlers } = useDrag(p, 160, 'y');
  const size = p.size ?? (p.lg ? 34 : 26);
  const t = (clamp(p.value, min, max) - min) / (max - min || 1);
  const A = (135 * Math.PI) / 180;
  const ang = -A + t * 2 * A;
  const zero = p.bipolar ? 0 : -A;
  const r = size / 2 - 2;
  const c = size / 2;
  const shown = p.fmt ? p.fmt(p.value) : String(Math.round(p.value * 100) / 100);
  return (
    <div className={`knob${p.lg ? ' lg' : ''}${active ? ' active' : ''}`} data-info={p.info ?? (p.label ? `${p.label}|Drag up or down to change. Shift-drag for fine control; double-click resets.` : undefined)} tabIndex={0} {...handlers} style={{ opacity: p.disabled ? 0.4 : 1, ...p.style }}>
      <svg width={size} height={size}>
        <path className="track" d={arc(c, c, r, -A, A)} strokeWidth="2" fill="none" />
        {Math.abs(ang - zero) > 0.01 && <path className="val" d={arc(c, c, r, Math.min(zero, ang), Math.max(zero, ang))} strokeWidth="2" fill="none" />}
        <circle className="cap" cx={c} cy={c} r={r - 3.5} strokeWidth="1" />
        <line className="ind" x1={c + (r - 9) * Math.sin(ang) * 0.2} y1={c - (r - 9) * Math.cos(ang) * 0.2} x2={c + (r - 4) * Math.sin(ang)} y2={c - (r - 4) * Math.cos(ang)} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="kv">{shown}</div>
      {p.label && <div className="kl">{p.label}</div>}
    </div>
  );
};

export const Slider = (p: ValueProps & { style?: CSSProperties; bipolar?: boolean }) => {
  const min = p.min ?? 0;
  const max = p.max ?? 127;
  const ref = useRef<HTMLDivElement>(null);
  const { handlers } = useDrag(p, 220, 'x');
  const t = (clamp(p.value, min, max) - min) / (max - min || 1);
  const shown = p.fmt ? p.fmt(p.value) : String(Math.round(p.value * 100) / 100);
  const zeroT = p.bipolar ? (0 - min) / (max - min) : 0;
  const left = Math.min(t, zeroT);
  const width = Math.abs(t - zeroT);
  return (
    <div ref={ref} className="slider" tabIndex={0} data-info={p.info ?? (p.label ? `${p.label}|Drag left or right. Shift-drag for fine control; double-click resets.` : undefined)} style={{ opacity: p.disabled ? 0.4 : 1, ...p.style }} {...handlers}>
      <div className="fill" style={{ left: `${left * 100}%`, width: `${width * 100}%` }} />
      <div className="txt">
        <span className="dim">{p.label}</span>
        <span className="v">{shown}</span>
      </div>
    </div>
  );
};

export const VSlider = (p: ValueProps & { height?: number }) => {
  const min = p.min ?? 0;
  const max = p.max ?? 127;
  const { handlers } = useDrag(p, p.height ?? 120, 'y');
  const t = (clamp(p.value, min, max) - min) / (max - min || 1);
  return (
    <div className="vslider" tabIndex={0} data-info={p.info} style={{ height: p.height ?? 120 }} {...handlers}>
      <div className="fill" style={{ height: `${t * 100}%` }} />
      <div className="cap" style={{ bottom: `calc(${t * 100}% - 1px)` }} />
    </div>
  );
};

export const NumBox = (p: ValueProps & { width?: number; style?: CSSProperties }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const { handlers } = useDrag(p, 200, 'y');
  const shown = p.fmt ? p.fmt(p.value) : String(Math.round(p.value * 100) / 100);
  if (editing)
    return (
      <div className="numbox editing" style={{ width: p.width, ...p.style }}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseFloat(text);
              if (Number.isFinite(v)) p.onChange(clamp(v, p.min ?? -Infinity, p.max ?? Infinity));
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      </div>
    );
  return (
    <div
      className="numbox"
      tabIndex={0}
      data-info={p.info ?? (p.label ? `${p.label}|Drag up or down, or double-click to type a value.` : undefined)}
      style={{ width: p.width, opacity: p.disabled ? 0.4 : 1, ...p.style }}
      {...handlers}
      onDoubleClick={() => {
        if (p.disabled) return;
        setText(String(p.value));
        setEditing(true);
      }}
    >
      {shown}
    </div>
  );
};

export const Field = ({ label, children, info, style }: { label: string; children: ReactNode; info?: string; style?: CSSProperties }) => (
  <label className="field" data-info={info} style={style}>
    <span className="label">{label}</span>
    {children}
  </label>
);

export const Btn = ({ on, children, info, onClick, className, disabled, title, style, onPointerDown, onPointerUp }: {
  on?: boolean; children: ReactNode; info?: string; onClick?: (e: React.MouseEvent) => void; className?: string; disabled?: boolean; title?: string; style?: CSSProperties;
  onPointerDown?: (e: React.PointerEvent) => void; onPointerUp?: (e: React.PointerEvent) => void;
}) => (
  <button
    type="button"
    className={`btn${on ? ' on' : ''}${className ? ` ${className}` : ''}`}
    data-info={info}
    aria-pressed={on}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
    style={style}
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
  >
    {children}
  </button>
);

export interface Opt<T extends string | number> { value: T; label: string; group?: string }

export function Select<T extends string | number>({ value, options, onChange, info, style, disabled }: {
  value: T; options: Opt<T>[]; onChange: (v: T) => void; info?: string; style?: CSSProperties; disabled?: boolean;
}) {
  const groups = new Map<string, Opt<T>[]>();
  for (const o of options) {
    const g = o.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  const isNum = typeof value === 'number';
  return (
    <select
      className="select"
      value={String(value)}
      data-info={info}
      style={style}
      disabled={disabled}
      onChange={(e) => onChange((isNum ? Number(e.target.value) : e.target.value) as T)}
    >
      {[...groups.entries()].map(([g, opts]) =>
        g ? (
          <optgroup key={g} label={g}>
            {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </optgroup>
        ) : (
          opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)
        ),
      )}
    </select>
  );
}

export const Seg = <T extends string | number>({ value, options, onChange, info }: { value: T; options: Opt<T>[]; onChange: (v: T) => void; info?: string }) => (
  <div className="seg" data-info={info}>
    {options.map((o) => (
      <button key={String(o.value)} type="button" className={`btn${o.value === value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

export const Section = ({ title, children, right, style, className, info }: { title: ReactNode; children: ReactNode; right?: ReactNode; style?: CSSProperties; className?: string; info?: string }) => (
  <div className={`section${className ? ` ${className}` : ''}`} style={style}>
    <div className="sh" data-info={info}>
      <span>{title}</span>
      <span className="grow" />
      {right}
    </div>
    <div className="sb">{children}</div>
  </div>
);

export const Meter = ({ value, vertical = true, style }: { value: number; vertical?: boolean; style?: CSSProperties }) => {
  const v = clamp(value, 0, 1);
  const db = v > 0 ? Math.max(0, 1 + Math.log10(v) / 2.4) : 0; // ~48 dB range
  return (
    <div className={`meter${vertical ? '' : ' h'}`} style={style}>
      <div className="m" style={vertical ? { height: `${db * 100}%` } : { width: `${db * 100}%` }} />
    </div>
  );
};

export const TextInput = ({ value, onChange, info, style, placeholder, onEnter }: { value: string; onChange: (v: string) => void; info?: string; style?: CSSProperties; placeholder?: string; onEnter?: () => void }) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="input"
      value={v}
      placeholder={placeholder}
      data-info={info}
      style={style}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onChange(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          onChange(v);
          onEnter?.();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

/** Modal dialog. */
export const Dialog = ({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) => (
  <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="dialog" role="dialog" aria-label={title}>
      <div className="dh">
        <span className="grow">{title}</span>
        <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="db">{children}</div>
      {footer && <div className="df">{footer}</div>}
    </div>
  </div>
);
