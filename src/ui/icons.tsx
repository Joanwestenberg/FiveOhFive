// Monochrome 12px stroke icons. currentColor only.
import type { ReactElement } from 'react';

const S = (d: ReactElement) => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const Icon = {
  play: S(<path d="M3 2l7 4-7 4z" fill="currentColor" stroke="none" />),
  stop: S(<rect x="2.5" y="2.5" width="7" height="7" fill="currentColor" stroke="none" />),
  rec: S(<circle cx="6" cy="6" r="3.6" fill="currentColor" stroke="none" />),
  undo: S(<path d="M4 3L1.8 5.2 4 7.4M2 5.2h5.2a3 3 0 010 6H5" />),
  redo: S(<path d="M8 3l2.2 2.2L8 7.4M10 5.2H4.8a3 3 0 000 6H7" />),
  prev: S(<path d="M7.5 2.5L4 6l3.5 3.5" />),
  next: S(<path d="M4.5 2.5L8 6l-3.5 3.5" />),
  plus: S(<path d="M6 2v8M2 6h8" />),
  minus: S(<path d="M2 6h8" />),
  x: S(<path d="M3 3l6 6M9 3L3 9" />),
  save: S(<path d="M2 2h6.5L10 3.5V10H2zM4 2v3h4V2M4 10V7h4v3" />),
  sun: S(<g><circle cx="6" cy="6" r="2.2" /><path d="M6 .8v1.4M6 9.8v1.4M.8 6h1.4M9.8 6h1.4M2.3 2.3l1 1M8.7 8.7l1 1M2.3 9.7l1-1M8.7 3.3l1-1" /></g>),
  moon: S(<path d="M9.8 7.4A4.2 4.2 0 014.6 2.2 4.2 4.2 0 109.8 7.4z" />),
  spark: S(<path d="M6 1v3M6 8v3M1 6h3M8 6h3M2.8 2.8l1.6 1.6M7.6 7.6l1.6 1.6M2.8 9.2l1.6-1.6M7.6 4.4l1.6-1.6" />),
  speaker: S(<path d="M1.5 4.5h2l3-2.5v8l-3-2.5h-2zM8.5 4a2.5 2.5 0 010 4M9.8 2.6a4.5 4.5 0 010 6.8" />),
  panic: S(<path d="M6 1.5l4.8 8.5H1.2zM6 5v2.2M6 8.6v.1" />),
  folder: S(<path d="M1.5 3h3l1 1.2h5V10h-9z" />),
  download: S(<path d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10.5h8" />),
  upload: S(<path d="M6 8V2M3.5 4.5L6 2l2.5 2.5M2 10.5h8" />),
  copy: S(<path d="M4 4h6v6H4zM2 8V2h6" />),
  trash: S(<path d="M2 3h8M4.5 3V1.8h3V3M3 3l.6 7.2h4.8L9 3" />),
  send: S(<path d="M1.5 6l9-4.2-3.4 8.7-1.6-3.3z" />),
  dice: S(<g><rect x="1.8" y="1.8" width="8.4" height="8.4" rx="1.5" /><circle cx="4.2" cy="4.2" r=".5" fill="currentColor" /><circle cx="7.8" cy="7.8" r=".5" fill="currentColor" /><circle cx="6" cy="6" r=".5" fill="currentColor" /></g>),
  metro: S(<path d="M4 10.5L5 1.5h2l1 9zM6 7l3-4" />),
  loop: S(<path d="M2 6a3 3 0 013-3h4.5M8 1.5L9.8 3 8 4.5M10 6a3 3 0 01-3 3H2.5M4 10.5L2.2 9 4 7.5" />),
  piano: S(<g><rect x="1.5" y="2" width="9" height="8" /><path d="M4.5 2v8M7.5 2v8" /></g>),
  grid: S(<path d="M1.5 1.5h9v9h-9zM1.5 6h9M6 1.5v9M1.5 3.75h9M1.5 8.25h9" />),
  list: S(<path d="M3.5 3h7M3.5 6h7M3.5 9h7M1.5 3h.1M1.5 6h.1M1.5 9h.1" />),
  chevronDown: S(<path d="M3 4.5L6 7.5l3-3" />),
};
