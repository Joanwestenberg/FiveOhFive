# FiveOhFive

**A feature-parity emulator of the Roland MC-505 Groovebox, built to run entirely in the browser.**

FiveOhFive aims to recreate the classic late-90s Roland MC-505 Groovebox, with its sounds, sequencer, and hands-on workflow, using nothing but modern web technologies. There's nothing to install, no plugins, and no server-side audio. Open a tab and start making grooves.

## Goals

- **Feature parity** with the original MC-505. That means its synth engine, patterns, parts, effects, and performance controls, not a loose "inspired by" tribute.
- **Completely in-browser.** All synthesis, sequencing, and effects run client-side using the Web Audio API, AudioWorklets, and WebAssembly where needed.
- **Faithful workflow.** Pattern-based sequencing, realtime and step recording, RPS (Realtime Phrase Sequence), the arpeggiator, and the knob-and-button feel of the hardware.
- **Low latency** and stable timing, suitable for live performance.
- **MIDI support** through the Web MIDI API, for external controllers and sync.

## Planned features

- [ ] Multi-part synth engine (melodic parts plus a rhythm part)
- [ ] Oscillators, filters, envelopes, and LFOs matching the MC-505's voice architecture
- [ ] Rhythm part with drum kits
- [ ] Pattern sequencer with realtime and step recording
- [ ] RPS (Realtime Phrase Sequence)
- [ ] Arpeggiator
- [ ] Effects: reverb, delay, and multi-effects
- [ ] Megamix and performance controls
- [ ] Song mode
- [ ] Web MIDI input, output, and clock sync
- [ ] Save, load, and share patterns and patches
- [ ] Hardware-inspired UI that is playable on desktop and touch devices

## Status

🚧 Early days. We're building it now.

## Disclaimer

FiveOhFive is an independent project and is not affiliated with, endorsed by, or connected to Roland Corporation. "Roland" and "MC-505" are trademarks of their respective owners. No original Roland sample data or firmware is distributed with this project.
