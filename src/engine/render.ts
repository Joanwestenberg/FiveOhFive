// Offline rendering of the current pattern to a WAV file, using the same worklet engine.
import workletUrl from './worklet.ts?worker&url';
import type { Pattern, SystemSettings } from '../model/types';
import type { ToEngine } from './messages';
import { patternTicks } from '../model/defaults';

export const renderPatternWav = async (p: Pattern, sys: SystemSettings, loops: number, tailSec = 2, sr = 44100): Promise<Blob> => {
  const secs = (patternTicks(p) / 96) * (60 / p.tempo) * loops + tailSec;
  const ctx = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
  await ctx.audioWorklet.addModule(workletUrl);
  const init: ToEngine[] = [
    { type: 'system', sys: { ...sys, metronome: 'off', midi: { ...sys.midi, seqOut: false, clockOut: false } } },
    { type: 'pattern', pattern: p, mode: 'replace' },
    { type: 'play', countIn: false },
  ];
  const node = new AudioWorkletNode(ctx, 'fiveohfive', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { init, stopAfterLoops: loops } });
  node.connect(ctx.destination);
  const buf = await ctx.startRendering();
  return encodeWav(buf);
};

export const encodeWav = (buf: AudioBuffer): Blob => {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([data.buffer], { type: 'audio/wav' });
};
