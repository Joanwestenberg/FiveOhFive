// Info View plumbing: any element with data-info="Title|Help" describes itself on hover.
import { useSyncExternalStore } from 'react';

const touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
const DEFAULT = touch
  ? { t: 'FiveOhFive', h: 'Tap any control to see what it does. Drag knobs up and down.' }
  : { t: 'FiveOhFive', h: 'Hover any control to see what it does. Space plays and stops; the computer keyboard plays notes (A–K, W E T Y U for sharps, Z/X for octave).' };
let info = DEFAULT;
const ls = new Set<() => void>();
export const setInfo = (t: string, h = '') => {
  if (info.t === t && info.h === h) return;
  info = { t, h };
  for (const l of ls) l();
};
export const useInfo = () => useSyncExternalStore((cb) => { ls.add(cb); return () => ls.delete(cb); }, () => info, () => info);

export const installInfoListener = () => {
  let last: Element | null = null;
  const onOver = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.('[data-info]') ?? null;
    if (el === last) return;
    last = el;
    if (!el) return setInfo(DEFAULT.t, DEFAULT.h);
    const [t, ...h] = (el.getAttribute('data-info') ?? '').split('|');
    setInfo(t, h.join('|'));
  };
  document.addEventListener('mouseover', onOver);
  document.addEventListener('focusin', onOver);
  return () => {
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('focusin', onOver);
  };
};
