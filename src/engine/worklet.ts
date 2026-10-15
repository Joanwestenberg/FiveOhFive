/// <reference path="./worklet-env.d.ts" />
// AudioWorklet entry: hosts the Engine on the audio thread.
import { Engine } from './core';
import type { ToEngine } from './messages';

interface Options { init?: ToEngine[]; stopAfterLoops?: number }

class FiveOhFiveProcessor extends AudioWorkletProcessor {
  engine = new Engine(sampleRate);
  stopAfter = 0;
  wraps = 0;
  constructor(opts?: { processorOptions?: Options }) {
    super();
    const o = opts?.processorOptions;
    for (const m of o?.init ?? []) this.engine.handle(m);
    this.stopAfter = o?.stopAfterLoops ?? 0;
    this.port.onmessage = (e: MessageEvent) => {
      const msgs = (Array.isArray(e.data) ? e.data : [e.data]) as ToEngine[];
      for (const m of msgs) {
        try {
          this.engine.handle(m);
        } catch (err) {
          this.port.postMessage([{ type: 'error', message: String(err) }]);
        }
      }
    };
    this.port.postMessage([{ type: 'ready', sampleRate }]);
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] ?? out[0];
    this.engine.render(L, R, L.length);
    const o = this.engine.drain();
    if (this.stopAfter) {
      for (const m of o) if (m.type === 'wrap' && ++this.wraps >= this.stopAfter) this.engine.handle({ type: 'stop', turntable: false });
    } else if (o.length) this.port.postMessage(o);
    return true;
  }
}

registerProcessor('fiveohfive', FiveOhFiveProcessor as unknown as new () => AudioWorkletProcessor);
