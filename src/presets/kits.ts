// Preset rhythm sets. Every instrument is synthesised (see engine/dsp/drum.ts), so each kit is
// just a recipe: model + tune / decay / tone / snap per key. Key layout follows General MIDI.

import type { DrumInst, Kit } from '../model/types';
import { defaultDrum } from '../model/defaults';

type Inst = Partial<DrumInst> & { model: DrumInst['model']; name: string };

/** Notes shown on the 16 pads in rhythm mode, in pad order. */
export const PAD_NOTES = [36, 38, 39, 37, 42, 44, 46, 49, 41, 45, 48, 51, 56, 62, 75, 70];

export const DRUM_NOTE_NAMES: Record<number, string> = {
  35: 'KICK 2', 36: 'KICK', 37: 'RIM', 38: 'SNARE', 39: 'CLAP', 40: 'SNARE 2', 41: 'LOW TOM', 42: 'CL HAT', 43: 'LOW TOM 2',
  44: 'PEDAL HAT', 45: 'MID TOM', 46: 'OP HAT', 47: 'MID TOM 2', 48: 'HI TOM', 49: 'CRASH', 50: 'HI TOM 2', 51: 'RIDE',
  54: 'TAMBOURINE', 56: 'COWBELL', 60: 'HI BONGO', 61: 'LO BONGO', 62: 'MUTE CONGA', 63: 'HI CONGA', 64: 'LO CONGA', 70: 'MARACAS',
  75: 'CLAVES', 76: 'HI BLOCK', 77: 'LO BLOCK', 80: 'ZAP', 81: 'NOISE', 82: 'SCRATCH', 83: 'SUB HIT', 84: 'BLIP', 85: 'REV NOISE',
};

const base = (): Record<number, Inst> => ({
  35: { name: 'KICK 2', model: 'kick', decay: 50, tone: 60, snap: 40 },
  36: { name: 'KICK', model: 'kick', decay: 70, tone: 50, snap: 50 },
  37: { name: 'RIM', model: 'rim', decay: 40, level: 100 },
  38: { name: 'SNARE', model: 'snare', decay: 60, tone: 60, snap: 70 },
  39: { name: 'CLAP', model: 'clap', decay: 55, tone: 50, rev: 20 },
  40: { name: 'SNARE 2', model: 'snare', tune: 3, decay: 45, tone: 80, snap: 90 },
  41: { name: 'LOW TOM', model: 'tom', tune: -5, decay: 70, pan: -30 },
  42: { name: 'CL HAT', model: 'hat', decay: 25, tone: 70, snap: 30, choke: 1, pan: 10, level: 90 },
  43: { name: 'LOW TOM 2', model: 'tom', tune: -3, decay: 65, pan: -20 },
  44: { name: 'PEDAL HAT', model: 'hat', decay: 18, tone: 60, snap: 20, choke: 1, pan: 10, level: 80 },
  45: { name: 'MID TOM', model: 'tom', tune: 0, decay: 65, pan: 0 },
  46: { name: 'OP HAT', model: 'hat', decay: 75, tone: 70, snap: 30, choke: 1, pan: 10, level: 90 },
  47: { name: 'MID TOM 2', model: 'tom', tune: 2, decay: 60, pan: 10 },
  48: { name: 'HI TOM', model: 'tom', tune: 5, decay: 60, pan: 25 },
  49: { name: 'CRASH', model: 'cymbal', decay: 90, tone: 60, snap: 60, pan: -20, level: 85 },
  50: { name: 'HI TOM 2', model: 'tom', tune: 7, decay: 55, pan: 35 },
  51: { name: 'RIDE', model: 'cymbal', tune: 5, decay: 80, tone: 80, snap: 20, pan: 20, level: 75 },
  54: { name: 'TAMBOURINE', model: 'shaker', decay: 45, tone: 90, pan: 30 },
  56: { name: 'COWBELL', model: 'cowbell', decay: 40, tone: 60, pan: -15, level: 90 },
  60: { name: 'HI BONGO', model: 'conga', tune: 7, decay: 30, pan: 25 },
  61: { name: 'LO BONGO', model: 'conga', tune: 2, decay: 35, pan: 20 },
  62: { name: 'MUTE CONGA', model: 'conga', tune: 3, decay: 15, pan: -20 },
  63: { name: 'HI CONGA', model: 'conga', tune: 2, decay: 40, pan: -25 },
  64: { name: 'LO CONGA', model: 'conga', tune: -3, decay: 45, pan: -30 },
  70: { name: 'MARACAS', model: 'shaker', decay: 20, tone: 100, pan: 35, level: 85 },
  75: { name: 'CLAVES', model: 'clave', decay: 40, pan: 30 },
  76: { name: 'HI BLOCK', model: 'clave', tune: -5, decay: 30, pan: -30 },
  77: { name: 'LO BLOCK', model: 'clave', tune: -10, decay: 30, pan: -35 },
  80: { name: 'ZAP', model: 'zap', decay: 40, tone: 60, snap: 30 },
  81: { name: 'NOISE', model: 'noise', decay: 60, tone: 90, snap: 30, rev: 30 },
  82: { name: 'SCRATCH', model: 'scratch', decay: 50, tone: 50 },
  83: { name: 'SUB HIT', model: 'tone', wave: 'sine', tune: -24, decay: 80, tone: 30, snap: 40, drive: 40 },
  84: { name: 'BLIP', model: 'tone', wave: 'square', tune: 12, decay: 20, tone: 80, snap: 20 },
  85: { name: 'REV NOISE', model: 'noise', decay: 90, tone: 20, snap: 90, rev: 50 },
});

const kit = (name: string, category: string, mods: Record<number, Partial<Inst>>): Kit => {
  const b = base();
  for (const [k, v] of Object.entries(mods)) b[+k] = { ...(b[+k] ?? { name: DRUM_NOTE_NAMES[+k] ?? `NOTE ${k}`, model: 'click' }), ...v } as Inst;
  const insts = Object.entries(b).map(([note, spec]) => {
    const d = defaultDrum(+note, spec.name, spec.model);
    return { ...d, ...spec, note: +note } as DrumInst;
  });
  return { name, category, insts };
};

export const PRESET_KITS: Kit[] = [
  kit('BOOM KIT', 'ANALOG', {
    36: { decay: 95, tone: 30, snap: 20, level: 120 }, 38: { decay: 55, tone: 50, snap: 75 }, 39: { decay: 60, tone: 40 },
    42: { decay: 20, snap: 15 }, 46: { decay: 70, snap: 15 }, 56: { decay: 45 }, 49: { decay: 95, snap: 40 },
  }),
  kit('PUNCH KIT', 'ANALOG', {
    36: { decay: 60, tone: 70, snap: 85, drive: 20, level: 120 }, 38: { decay: 55, tone: 75, snap: 95, tune: 2 }, 39: { decay: 50, tone: 60 },
    42: { decay: 22, snap: 70, tone: 90 }, 46: { decay: 60, snap: 70, tone: 90 }, 51: { snap: 60, tone: 95 }, 49: { snap: 80 },
  }),
  kit('THIN KIT', 'ANALOG', {
    36: { decay: 40, tone: 40, snap: 40, tune: 4 }, 38: { decay: 35, tone: 85, snap: 100, tune: 5 }, 42: { decay: 14, snap: 50, tone: 100 }, 46: { decay: 45, snap: 50, tone: 100 },
  }),
  kit('RHYTHM BOX', 'ANALOG', {
    36: { decay: 45, tone: 20, snap: 10, tune: 3 }, 38: { decay: 35, tone: 40, snap: 40 }, 42: { decay: 15, snap: 10, tone: 50 }, 46: { decay: 40, tone: 50, snap: 10 },
    75: { decay: 30, level: 110 }, 70: { decay: 15 }, 56: { model: 'clave', tune: -8, decay: 30 },
  }),
  kit('HOUSE KIT', 'HOUSE', {
    36: { decay: 65, tone: 55, snap: 70, level: 120, drive: 10 }, 38: { decay: 50, snap: 80, tone: 70 }, 39: { decay: 70, tone: 55, rev: 35, level: 115 },
    42: { decay: 22, snap: 60, tone: 85 }, 46: { decay: 55, snap: 65, tone: 85, level: 95 }, 70: { decay: 25, level: 95 }, 54: { decay: 40, level: 90 },
  }),
  kit('TECHNO KIT', 'TECHNO', {
    36: { decay: 70, tone: 60, snap: 90, drive: 70, level: 115 }, 38: { decay: 40, snap: 100, tone: 90, drive: 30 }, 39: { decay: 45, tone: 70, drive: 30 },
    42: { decay: 16, snap: 80, tone: 100 }, 46: { decay: 50, snap: 80, tone: 100 }, 37: { decay: 50, level: 110, rev: 40 }, 51: { tone: 100, snap: 50 },
  }),
  kit('TRANCE KIT', 'TRANCE', {
    36: { decay: 72, tone: 45, snap: 80, drive: 25, level: 122 }, 39: { decay: 75, tone: 65, rev: 50, level: 110 }, 38: { decay: 60, snap: 90, rev: 30 },
    42: { decay: 18, snap: 60, tone: 95 }, 46: { decay: 50, snap: 65, tone: 95 }, 49: { decay: 110, snap: 80, rev: 40 },
  }),
  kit('BREAK KIT', 'BREAKS', {
    36: { decay: 55, tone: 40, snap: 70, drive: 40, level: 120 }, 38: { decay: 55, tone: 60, snap: 85, drive: 40, level: 120 }, 40: { decay: 30, snap: 60, level: 70 },
    42: { decay: 20, snap: 90, tone: 70 }, 46: { decay: 55, snap: 90, tone: 70 }, 51: { snap: 85, tone: 70 },
  }),
  kit('JUNGLE KIT', 'D&B', {
    36: { decay: 45, tone: 50, snap: 80, tune: 2, drive: 30 }, 38: { decay: 40, tune: 7, tone: 85, snap: 95, level: 120 }, 40: { tune: 9, decay: 25, snap: 80, level: 80 },
    42: { decay: 16, snap: 90, tone: 100 }, 46: { decay: 40, snap: 90, tone: 100 }, 83: { tune: -26, decay: 100, drive: 60, level: 120 },
  }),
  kit('HIPHOP KIT', 'HIP HOP', {
    36: { decay: 80, tone: 25, snap: 50, drive: 40, level: 122 }, 38: { decay: 55, tone: 45, snap: 65, drive: 25, tune: -3 }, 39: { decay: 60, tone: 40, rev: 15 },
    42: { decay: 20, snap: 40, tone: 55, level: 85 }, 46: { decay: 50, snap: 40, tone: 55 }, 37: { decay: 30, level: 110 },
  }),
  kit('LO-FI KIT', 'HIP HOP', {
    36: { decay: 60, tone: 20, snap: 30, drive: 80, level: 115 }, 38: { decay: 45, tone: 30, snap: 55, drive: 70, tune: -5 }, 42: { decay: 18, snap: 30, tone: 30, drive: 40 },
    46: { decay: 45, snap: 30, tone: 30, drive: 40 }, 39: { decay: 50, tone: 30, drive: 50 },
  }),
  kit('ELECTRO KIT', 'ELECTRO', {
    36: { decay: 90, tone: 35, snap: 30, level: 122 }, 38: { decay: 45, tone: 60, snap: 90, tune: 4 }, 39: { decay: 50, rev: 30 },
    42: { decay: 15, snap: 20, tone: 80 }, 46: { decay: 45, snap: 20, tone: 80 }, 56: { decay: 50, level: 100 }, 80: { decay: 35, tone: 80 },
  }),
  kit('INDUSTRIAL KIT', 'TECHNO', {
    36: { decay: 70, tone: 80, snap: 100, drive: 127, level: 110 }, 38: { decay: 50, snap: 100, tone: 100, drive: 100 }, 39: { model: 'noise', decay: 40, tone: 90, snap: 70, drive: 60 },
    42: { model: 'noise', decay: 10, tone: 127, snap: 10 }, 46: { model: 'cymbal', decay: 55, tone: 110, snap: 100, drive: 50 }, 37: { model: 'scratch', decay: 35 },
  }),
  kit('PERCUSSION', 'PERC', {
    36: { model: 'conga', tune: -12, decay: 60 }, 38: { model: 'conga', tune: 5, decay: 25 }, 39: { model: 'clap', decay: 35, rev: 40 }, 37: { model: 'clave', tune: -3 },
    42: { model: 'shaker', decay: 18, tone: 100 }, 44: { model: 'shaker', decay: 10, tone: 80 }, 46: { model: 'shaker', decay: 45, tone: 90 },
    41: { model: 'conga', tune: -7, decay: 50 }, 45: { model: 'conga', tune: -2, decay: 45 }, 48: { model: 'conga', tune: 4, decay: 40 },
  }),
  kit('FX KIT', 'FX', {
    36: { model: 'tone', wave: 'sine', tune: -24, decay: 70, snap: 80, drive: 60 }, 38: { model: 'noise', decay: 40, tone: 100, snap: 60 }, 39: { model: 'zap', decay: 30, tone: 90 },
    42: { model: 'click', tune: 12, decay: 10 }, 46: { model: 'noise', decay: 70, tone: 30, snap: 90 }, 37: { model: 'scratch', decay: 40 }, 49: { model: 'noise', decay: 110, tone: 10, snap: 100, rev: 60 },
  }),
];

export const findKit = (name: string) => PRESET_KITS.find((k) => k.name.toLowerCase() === name.toLowerCase());
