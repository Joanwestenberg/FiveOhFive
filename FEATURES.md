# Feature comparison with the MC-505

This table maps the hardware's features to FiveOhFive. "Done" means the feature works the way the hardware's does. "Approximated" means the feature exists but differs in a way worth knowing. "Missing" means it is not implemented yet.

The biggest difference is the sound source. The MC-505 plays back an 8 MB ROM of sampled waveforms. FiveOhFive ships no Roland data, so every waveform and drum is synthesised. The engine's architecture (tones, structures, filter, envelopes, LFOs, effects) follows the hardware, but the presets are new sounds in the same spirit, not copies of the ROM.

## Sound generator

| MC-505 | FiveOhFive | Status |
|---|---|---|
| 8 parts: 7 synth parts + rhythm part R | Same | Done |
| 64-voice polyphony | 64 synth voices + 40 drum voices, oldest-released stealing | Done |
| ROM waveforms (sampled) | 42 synthesised generators: PolyBLEP saw/square/pulse/tri/sine, super saw, hard sync, feedback oscillator, 303-style tables, additive organ/strings/brass/vox/reed/flute/digital tables, 2-op FM (piano, tine, bell, mallet, bass, metal), Karplus-Strong plucks, white/pink noise | Approximated |
| 512 preset patches | 103 preset patches in 15 categories | Approximated |
| User patches | Unlimited user patch bank (WRITE TO USER) | Done |
| Two tones per patch with structure types | Two tones; structures MIX, RING, RING+2, FXM, SYNC with depth | Done |
| Booster | Per-tone drive before the filter | Done |
| Pitch envelope, coarse/fine, random pitch, key follow | Same | Done |
| TVF: LPF / BPF / HPF / PKG with cutoff, resonance, key follow, envelope, velocity | Same, plus a 24 dB lowpass | Done |
| TVA envelope with velocity sensitivity | Same | Done |
| LFOs with tempo sync, delay, fade, key sync; pitch/filter/amp/pan depth | Two LFOs per tone, 8 waveforms (TRI, SIN, SAW, SQR, TRP, S&H, RND, CHS) | Done |
| Mono, legato, portamento, bend range | Same, plus analog-feel drift | Done |
| 20 preset rhythm sets | 15 synthesised kits (808/909/606/CR-78 style, house, techno, trance, breaks, jungle, hip hop, lo-fi, electro, industrial, percussion, FX) | Approximated |
| Rhythm tone editing (pitch, decay, level, pan, sends, mute group) | 16 drum models with tune, decay, tone, snap, drive, level, pan, reverb/delay sends, choke group, velocity sensitivity | Done |

## Effects

| MC-505 | FiveOhFive | Status |
|---|---|---|
| Multi-effect (EFX) with 24 types and two control knobs | 25 types (isolator, super filter, step filter, lo-fi, distortion, overdrive, compressor, phaser, step phaser, flanger, step flanger, chorus, Space-D, tremolo, auto pan, slicer, auto wah, ring mod, step ring mod, rotary, enhancer, BPM delay, pitch shifter, radio tuning, 4-band EQ) with CTRL 1/2 | Approximated (type list is similar, not identical) |
| Per-part EFX switch | Same | Done |
| Reverb with types | Room 1/2, stage, hall 1/2, plate, delay, pan delay | Done |
| Tempo-synced delay | Mono, stereo, ping-pong; note-value or ms; feedback, damping, send to reverb | Done |
| Low boost | Bass shelf with frequency and gain | Done |

## Sequencer

| MC-505 | FiveOhFive | Status |
|---|---|---|
| 96 PPQN resolution | 96 PPQN, sample-accurate on the audio thread | Done |
| 714 preset patterns | 32 preset patterns across 21 genres | Approximated |
| 200 user patterns | 200 user slots; edits to presets are kept automatically and can be reverted | Done |
| Pattern length 1-32 measures, time signature | Same | Done |
| Pattern switching at the end of the pattern | Same (next pattern is queued while playing) | Done |
| Realtime loop recording with input quantize | Same, with count-in and metronome | Done |
| Realtime erase | Hold ERASE while recording | Done |
| TR-REC on 16 keys | TR-REC pad mode plus a full step grid view | Done |
| Step recording | Piano roll, step grid and Microscope instead of the hardware's step-entry screen | Approximated |
| Microscope (event edit) | Event list with editable time, note, velocity, gate, CC and bend | Done |
| Grid / shuffle / groove quantize | Same, 12 groove templates | Done |
| Playback groove (non-destructive) | Per-pattern playback groove | Done |
| Mute control part | Mute track recorded from PART MUTE pads | Done |
| Knob movements recorded | Realtime knobs, MIDI CC and pitch bend are recorded while recording | Done |
| Copy, erase, transpose, shift, velocity change | Same, plus gate scaling, double length, half copy, clipboard | Done |
| Song mode (pattern chain) | Songs with repeats and loop | Done |
| Undo | Multi-level undo/redo | Done (better than hardware) |

## Performance

| MC-505 | FiveOhFive | Status |
|---|---|---|
| Realtime modify knobs (cutoff, resonance, envelope, attack, decay, release, LFO) | Cutoff, resonance, env depth, attack, decay, release, LFO rate, LFO depth, pitch | Done (on the rhythm part, CUTOFF and RESONANCE drive a DJ-style filter) |
| 16 velocity-sensitive pads / keyboard | Pads with velocity by strike position; computer keyboard; MIDI | Done |
| Arpeggiator with styles, motifs and beat patterns | 17 styles, 10 beat patterns, octave range, gate, accent, shuffle, hold, fixed or played velocity | Approximated (style list differs) |
| RPS (Realtime Phrase Sequence) | 16 slots, any pattern part to any part, quantized start, hold | Done |
| Megamix | Swap individual parts in from another pattern at the next bar | Done |
| D-Beam controller | Pointer-driven beam assignable to cutoff, resonance, pitch, LFO, EFX controls, volume, sends | Done |
| Turntable emulation | Turntable stop with adjustable wind-down time | Done |
| Tap tempo | Same | Done |
| Part mute / part select | Same | Done |

## I/O and storage

| MC-505 | FiveOhFive | Status |
|---|---|---|
| MIDI in / out, clock sync | Web MIDI input (selected part or by channel), sequencer and clock out, clock in | Done (browser support required) |
| SmartMedia storage | Browser storage (IndexedDB autosave) and project file export/import | Done |
| SMF export/import | Standard MIDI File export and import | Done |
| Audio output | Realtime output plus offline WAV render | Done |

## Missing

- The original ROM sounds and the full 714-pattern library (not reproducible without Roland data).
- System exclusive and program-change control from external MIDI gear.
- Pattern "set" chaining shortcuts beyond song mode.

## Extras not on the hardware

- The AI assistant (bring your own Anthropic API key) that writes patterns and tweaks sounds through the same actions as the UI.
- Piano roll with velocity lane, multi-level undo, light/dark themes, WAV render, and the Info View describing every control.
