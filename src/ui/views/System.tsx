import { useState } from 'react';
import { Btn, NumBox, Section, Select, Seg } from '../widgets/widgets';
import { useApp, setSystem, getState, importProject, edit, status, type Project } from '../../store/store';
import { useMidi, initMidi, applyMidiSettings } from '../../midi/webmidi';
import { exportSmf, importSmf } from '../../midi/smf';
import { downloadFile, pickFile } from '../../store/persist';
import { renderPatternWav } from '../../engine/render';
import { patternTicks } from '../../model/defaults';

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'pattern';

export const SystemView = () => {
  const sys = useApp((s) => s.project.system);
  const midi = useMidi();
  const [loops, setLoops] = useState(2);
  const [busy, setBusy] = useState(false);
  const setMidi = (patch: Partial<typeof sys.midi>) => {
    setSystem({ midi: { ...sys.midi, ...patch } });
    setTimeout(applyMidiSettings, 0);
  };
  return (
    <div className="col gap8">
      <div className="grid2">
        <Section title="MIDI" info="MIDI|Connect controllers and other gear with Web MIDI (Chrome, Edge, Opera, Firefox).">
          <div className="col gap4">
            {!midi.supported && <div className="msg-err">This browser does not support Web MIDI.</div>}
            {midi.supported && !midi.inputs.length && !midi.outputs.length && <Btn onClick={() => void initMidi(true)} info="Enable MIDI|Asks the browser for MIDI access.">ENABLE MIDI</Btn>}
            {midi.error && <div className="msg-err">{midi.error}</div>}
            <div className="row gap4">
              <span className="label" style={{ width: 70 }}>INPUT</span>
              <Select value={sys.midi.inputId} options={[{ value: '', label: 'ALL INPUTS' }, ...midi.inputs.map((i) => ({ value: i.id, label: i.name }))]} onChange={(inputId) => setMidi({ inputId })} info="MIDI input|Which device to listen to." />
            </div>
            <div className="row gap4">
              <span className="label" style={{ width: 70 }}>ROUTING</span>
              <Seg value={sys.midi.inMode} options={[{ value: 'current', label: 'SELECTED PART' }, { value: 'channels', label: 'BY CHANNEL' }]} onChange={(inMode) => setMidi({ inMode })} info="Input routing|Play the selected part from any channel, or address parts by their MIDI channel (R defaults to 10)." />
            </div>
            <div className="row gap4">
              <span className="label" style={{ width: 70 }}>OUTPUT</span>
              <Select value={sys.midi.outputId} options={[{ value: '', label: 'NONE' }, ...midi.outputs.map((i) => ({ value: i.id, label: i.name }))]} onChange={(outputId) => setMidi({ outputId })} info="MIDI output|Device that receives the sequencer and clock." />
            </div>
            <div className="row gap4">
              <Btn on={sys.midi.seqOut} onClick={() => setMidi({ seqOut: !sys.midi.seqOut })} info="Sequencer out|Send the pattern's notes to the MIDI output.">SEQ OUT</Btn>
              <Btn on={sys.midi.clockOut} onClick={() => setMidi({ clockOut: !sys.midi.clockOut })} info="Clock out|Send MIDI clock and start/stop.">CLOCK OUT</Btn>
              <Btn on={sys.midi.clockIn} onClick={() => setMidi({ clockIn: !sys.midi.clockIn })} info="Clock in|Follow tempo and start/stop from incoming MIDI clock.">CLOCK IN</Btn>
            </div>
          </div>
        </Section>
        <Section title="SEQUENCER & PERFORMANCE" info="Settings|Recording and performance settings.">
          <div className="col gap4">
            <div className="row gap4">
              <span className="label" style={{ width: 90 }}>METRONOME</span>
              <Seg value={sys.metronome} options={[{ value: 'off', label: 'OFF' }, { value: 'rec', label: 'REC ONLY' }, { value: 'always', label: 'ALWAYS' }]} onChange={(metronome) => setSystem({ metronome })} info="Metronome|When the click plays." />
            </div>
            <div className="row gap4">
              <span className="label" style={{ width: 90 }}>COUNT-IN</span>
              <Btn on={sys.countIn} onClick={() => setSystem({ countIn: !sys.countIn })} info="Count-in|A bar of click before recording.">{sys.countIn ? 'ON' : 'OFF'}</Btn>
            </div>
            <div className="row gap4">
              <span className="label" style={{ width: 90 }}>TURNTABLE</span>
              <NumBox value={sys.turntableTime} min={0.1} max={5} step={0.1} fmt={(v) => `${v.toFixed(1)} s`} onChange={(turntableTime) => setSystem({ turntableTime })} width={56} info="Turntable time|How long the turntable stop takes to wind down." />
            </div>
          </div>
        </Section>
      </div>
      <div className="grid2">
        <Section title="PATTERN FILES" info="Pattern files|Exchange patterns with DAWs as Standard MIDI Files, or render audio.">
          <div className="col gap4">
            <div className="row gap4">
              <span className="label">LOOPS</span>
              <NumBox value={loops} min={1} max={16} width={34} onChange={setLoops} info="Loops|How many times to repeat the pattern in exports." />
              <Btn onClick={() => { const p = getState().current; downloadFile(`${safeName(p.name)}.mid`, exportSmf(p, loops), 'audio/midi'); }} info="Export MIDI|Saves the current pattern as a Standard MIDI File.">EXPORT .MID</Btn>
              <Btn disabled={busy} onClick={async () => {
                const p = getState().current;
                setBusy(true);
                status('Rendering audio...');
                try {
                  const wav = await renderPatternWav(p, getState().project.system, loops);
                  downloadFile(`${safeName(p.name)}.wav`, wav, 'audio/wav');
                  status('Rendered WAV.');
                } catch (e) {
                  status(`Render failed: ${String(e)}`);
                } finally {
                  setBusy(false);
                }
              }} info="Render WAV|Renders the current pattern offline to a 44.1 kHz WAV file.">{busy ? 'RENDERING…' : 'RENDER .WAV'}</Btn>
            </div>
            <div className="row gap4">
              <Btn onClick={async () => {
                const f = await pickFile('.mid,.midi,audio/midi');
                if (!f) return;
                try {
                  const cur = getState().current;
                  const imp = importSmf(await f.arrayBuffer(), cur.parts);
                  const bar = (96 * 4 * imp.beat[0]) / imp.beat[1];
                  const measures = Math.max(1, Math.min(32, Math.ceil(imp.lengthTicks / bar)));
                  edit((p) => {
                    const np = { ...p, tempo: imp.tempo, beat: imp.beat, measures };
                    const len = patternTicks(np);
                    return { ...np, tracks: imp.tracks.map((tr) => tr.filter((e) => e.t < len)) };
                  });
                  status(`Imported ${f.name}: ${measures} measures at ${imp.tempo} BPM.`);
                } catch (e) {
                  status(`Import failed: ${String(e)}`);
                }
              }} info="Import MIDI|Replaces the current pattern's notes with a Standard MIDI File. Channel 10 goes to the rhythm part.">IMPORT .MID</Btn>
            </div>
          </div>
        </Section>
        <Section title="PROJECT" info="Project|Everything is saved in this browser automatically. Export a file to back up or move to another machine.">
          <div className="col gap4">
            <div className="row gap4">
              <Btn onClick={() => downloadFile('fiveohfive-project.json', JSON.stringify(getState().project), 'application/json')} info="Export project|Downloads all user patterns, edits, patches, kits, songs and settings.">EXPORT PROJECT</Btn>
              <Btn onClick={async () => {
                const f = await pickFile('.json,application/json');
                if (!f) return;
                try {
                  importProject(JSON.parse(await f.text()) as Project);
                } catch (e) {
                  status(`Import failed: ${String(e)}`);
                }
              }} info="Import project|Loads a project file, replacing the current one.">IMPORT PROJECT</Btn>
            </div>
            <div className="dim">User patterns: {Object.keys(getState().project.user).length} · Edited presets: {Object.keys(getState().project.edits).length} · User patches: {getState().project.userPatches.length} · User kits: {getState().project.userKits.length}</div>
          </div>
        </Section>
      </div>
      <Section title="ABOUT" info="About|FiveOhFive.">
        <div className="col gap4 dim" style={{ whiteSpace: 'normal' }}>
          <div>FiveOhFive is an independent, browser-based groovebox modelled on the workflow of the Roland MC-505. It is not affiliated with Roland. No Roland samples or firmware are included: every sound is synthesised in real time in an AudioWorklet.</div>
          <div>Parts: 7 synth parts with two-tone patches (oscillator, pitch envelope, filter, amp, two LFOs, ring/FXM/sync structures) plus a rhythm part with synthesised drum kits. 64 synth voices + 40 drum voices. 96 PPQN sequencer with patterns up to 32 measures, realtime and step recording, quantize, playback groove, mute control, RPS, arpeggiator, Megamix, song mode, D-Beam, turntable stop, 25 multi-effects, reverb and delay.</div>
        </div>
      </Section>
    </div>
  );
};
