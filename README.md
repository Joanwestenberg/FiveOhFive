# FiveOhFive

**A browser groovebox modelled on the Roland MC-505, with a bring-your-own-key AI assistant that programs patterns and designs sounds for you.**

FiveOhFive recreates the MC-505 workflow in a single web page: eight parts, a 96 PPQN pattern sequencer, realtime and TR-REC step recording, RPS, the arpeggiator, Megamix, the D-Beam, turntable stop, 25 multi-effects plus reverb and delay, and song mode. Everything runs client-side. All sound is synthesised in real time in an AudioWorklet, so there are no samples to download and nothing to install.

The assistant uses your own Anthropic API key, called directly from the browser. Ask it for "a 4-bar acid house track at 126 BPM" or "make the bassline squelchier" and it writes notes, picks and tweaks patches, sets effects and starts playback. Every change it makes can be undone.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Click **START AUDIO AND PLAY**, pick a pattern from the browser on the left, and twist the realtime knobs. Space plays and stops. The computer keyboard plays the selected part (A–K white keys, W E T Y U sharps, Z/X octave). Number keys 1–7 select parts and the backtick key selects the rhythm part.

To use the assistant, open **ASSIST**, click the gear, and paste an API key from [console.anthropic.com](https://console.anthropic.com). The key is stored only in this browser's local storage and is sent only to `api.anthropic.com`.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build a static site into `dist/` (deployable anywhere, uses relative paths) |
| `npm test` | Engine, preset and spectral tests (Vitest, runs the DSP in Node) |
| `npm run typecheck` | TypeScript only |

## What's in it

- **Sound engine.** 7 synth parts with two-tone patches (42 waveform generators: band-limited analog shapes, super saw, sync, feedback, FM, additive organ/strings/vox tables, Karplus-Strong plucks, noise), ring/FXM/sync structures, pitch and filter envelopes, LPF/LPF24/BPF/HPF/peaking filter with drive, amp envelope and two LFOs per tone. A rhythm part with 16 synthesised drum models. 64 synth voices + 40 drum voices.
- **Sequencer.** Patterns up to 32 measures in any time signature, realtime loop recording with input quantize, count-in and metronome, realtime erase, TR-REC on the pads and a full step grid, a canvas piano roll with a velocity lane, the Microscope event list, mute control track, grid/shuffle/groove quantize, non-destructive playback groove, transpose, shift, velocity and gate tools, undo/redo.
- **Performance.** Realtime-modify knobs (cutoff, resonance, envelope, attack, decay, release, LFO rate/depth, pitch) that record as controller data, 16 velocity-sensitive pads in five modes (keyboard, TR-REC, RPS, part mute, Megamix), D-Beam, arpeggiator with 17 styles and 10 beat patterns, RPS with 16 phrase slots, Megamix, turntable stop, tap tempo, low boost.
- **Effects.** 25 multi-effects (isolator, super filter, step filter, lo-fi, distortion, compressor, phasers, flangers, chorus, slicer, auto wah, ring mods, rotary, BPM delay, pitch shifter and more) with two CTRL knobs, plus reverb (8 types) and a tempo-synced delay.
- **Library.** 32 preset patterns across acid, house, techno, trance, jungle, D&B, breaks, hip hop, electro, dub, funk and ambient; 103 preset patches; 15 rhythm sets; 200 user pattern slots; user patch and kit banks; songs.
- **I/O.** Web MIDI in (by selected part or by channel), sequencer and clock out, clock in; Standard MIDI File import/export; offline WAV rendering; project export/import. The project autosaves to IndexedDB.
- **Assistant.** 20 tools covering note writing (explicit lists, compact step notation, drum grids), transforms, patch and drum parameters, mixer, effects, arpeggiator, transport, pattern management and songs. Streams responses, runs tools locally, and offers one-click undo of everything it changed.

See [FEATURES.md](FEATURES.md) for a feature-by-feature comparison with the hardware, including what is approximated and what is missing.

## Architecture

```
src/
  engine/        AudioWorklet engine (pure TypeScript; also runs in Node for tests)
    core.ts      voices, rhythm part, sequencer, arpeggiator, RPS, Megamix, mixer, effects routing
    dsp/         oscillators, wavetables, filters, envelopes/LFOs, synth voice, drum voice, effects
    worklet.ts   AudioWorkletProcessor wrapper; audio.ts is the main-thread bridge
  model/         data types, defaults, parameter metadata, step notation, event editing
  presets/       patches, rhythm sets, patterns, arpeggio styles, groove templates
  store/         app store (immutable updates diffed into engine messages), undo, persistence
  midi/          Web MIDI and Standard MIDI Files
  agent/         the BYOK assistant: tool definitions, system prompt, streaming tool loop
  ui/            React views and the Sedition-style greyscale widget kit
```

The sequencer runs on the audio thread at 96 PPQN, rendering in sub-blocks split at tick boundaries, so timing is sample-accurate and unaffected by the UI. The UI never talks to the DSP directly: every edit is an immutable update to the store, and the store diffs the working pattern and sends only what changed to the worklet.

## Design

The interface follows the Sedition design spec: a dense, flat, strictly greyscale tool UI. There is no hue anywhere; hierarchy comes from steps of grey, and anything that is "on" is shown by inverting it. Controls are 20px tall, rows 22px, corners 2px, and every control describes itself in the Info View at the bottom of the window when hovered. A light theme is one click away.

## Browser support

Chrome, Edge, Firefox and Safari 14.1+ (AudioWorklet is required). Web MIDI works in Chrome, Edge, Opera and Firefox.

## Disclaimer

FiveOhFive is an independent project and is not affiliated with, endorsed by, or connected to Roland Corporation. "Roland" and "MC-505" are trademarks of their respective owners. No Roland sample data or firmware is used or distributed; all sounds are synthesised.
