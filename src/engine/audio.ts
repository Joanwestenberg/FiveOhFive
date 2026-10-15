// Main-thread side of the engine: owns the AudioContext and the worklet node.
import workletUrl from './worklet.ts?worker&url';
import type { FromEngine, ToEngine } from './messages';

type Listener = (m: FromEngine) => void;

export class AudioBridge {
  ctx: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  analyser: AnalyserNode | null = null;
  recorderDest: MediaStreamAudioDestinationNode | null = null;
  private queue: ToEngine[] = [];
  private listeners = new Set<Listener>();
  private starting: Promise<void> | null = null;
  ready = false;

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(m: ToEngine) {
    if (this.node && this.ready) this.node.port.postMessage(m);
    else this.queue.push(m);
  }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'fiveohfive', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node = node;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      this.analyser = analyser;
      node.connect(analyser);
      analyser.connect(ctx.destination);
      this.recorderDest = ctx.createMediaStreamDestination();
      node.connect(this.recorderDest);
      await new Promise<void>((resolve) => {
        node.port.onmessage = (e: MessageEvent) => {
          const msgs = e.data as FromEngine[];
          for (const m of msgs) {
            if (m.type === 'ready') {
              this.ready = true;
              const q = this.queue;
              this.queue = [];
              for (const x of q) node.port.postMessage(x);
              resolve();
            }
            for (const l of this.listeners) l(m);
          }
        };
      });
      if (ctx.state !== 'running') await ctx.resume();
    })();
    this.starting.catch(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Convert an engine frame to a performance.now() timestamp for Web MIDI output. */
  frameToPerf(frame: number) {
    if (!this.ctx) return performance.now();
    const ahead = frame / this.ctx.sampleRate - this.ctx.currentTime;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return performance.now() + Math.max(0, (ahead + lat) * 1000);
  }
}

export const audio = new AudioBridge();
