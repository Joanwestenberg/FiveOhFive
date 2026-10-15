import { useEffect } from 'react';

export interface MenuItem { label: string; run: () => void }

export const ContextMenu = ({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) => {
  useEffect(() => {
    const close = () => onClose();
    const t = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
    };
  }, [onClose]);
  return (
    <div className="menu" style={{ left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - items.length * 22 - 8) }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it) => (
        <div key={it.label} className="mi" onClick={() => { it.run(); onClose(); }}>{it.label}</div>
      ))}
    </div>
  );
};
