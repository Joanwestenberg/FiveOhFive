import type {
  ArpSettings, FxSetup, Groove, Kit, MuteEv, PartSetup, Pattern, RpsSet, SeqEv, SystemSettings,
} from '../model/types';

export interface RpsPhrase { events: SeqEv[]; length: number; target: number }

export type ToEngine =
  | { type: 'pattern'; pattern: Pattern; mode: 'replace' | 'queue' }
  | { type: 'tracks'; tracks: SeqEv[][]; muteTrack: MuteEv[] }
  | { type: 'part'; index: number; setup: PartSetup }
  | { type: 'kit'; kit: Kit }
  | { type: 'fx'; fx: FxSetup }
  | { type: 'groove'; groove: Groove }
  | { type: 'tempo'; bpm: number }
  | { type: 'length'; measures: number; beat: [number, number] }
  | { type: 'play'; countIn: boolean }
  | { type: 'stop'; turntable: boolean }
  | { type: 'rec'; on: boolean; part: number }
  | { type: 'note'; part: number; note: number; vel: number; record?: boolean }
  | { type: 'cc'; part: number; cc: number; value: number; record?: boolean }
  | { type: 'bend'; part: number; value: number; record?: boolean }
  | { type: 'arp'; settings: ArpSettings; part: number }
  | { type: 'rps'; set: RpsSet; phrases: (RpsPhrase | null)[] }
  | { type: 'rpsPad'; slot: number; on: boolean }
  | { type: 'megamix'; part: number; events: SeqEv[] | null; length: number }
  | { type: 'system'; sys: SystemSettings }
  | { type: 'focus'; part: number }
  | { type: 'dbeam'; value: number | null }
  | { type: 'efxCtrl'; ctrl: 0 | 1; value: number }
  | { type: 'panic' };

export interface PosInfo {
  type: 'pos';
  tick: number; // pattern tick (negative during count-in)
  playing: boolean;
  recording: boolean;
  patternId: string;
  meters: number[]; // per part peak 0..1
  master: [number, number];
  hits: number[]; // per part: number of note-ons since last report
  drumHits: number[]; // drum notes struck since last report
  voices: number;
  rpsActive: number[];
  speed: number;
  heldArp: number;
}

export type FromEngine =
  | PosInfo
  | { type: 'rec'; part: number; events: SeqEv[] }
  | { type: 'wrap'; patternId: string; switched: boolean }
  | { type: 'midi'; frame: number; events: [number, number[]][] }
  | { type: 'stopped' }
  | { type: 'ready'; sampleRate: number };
