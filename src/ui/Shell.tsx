import { Icon } from './icons';
import { Btn, NumBox, Select, Meter } from './widgets/widgets';
import { useInfo } from './info';
import {
  useApp, useTransport, togglePlay, stop, toggleRec, setTempo, tapTempo, undo, redo, setState, setLength, startAudio,
  panic, getState, loadPattern, allPatternIds, getPattern, play, setErase,
} from '../store/store';
import { measureTicks, patternTicks } from '../model/defaults';

const BEATS: [number, number][] = [[4, 4], [3, 4], [2, 4], [5, 4], [6, 4], [7, 4], [6, 8], [7, 8], [12, 8], [5, 8]];

const Position = () => {
  const tick = useTransport((t) => Math.floor(t.tick));
  const playing = useTransport((t) => t.playing);
  const cur = useApp((s) => s.current);
  const bar = measureTicks(cur);
  const len = patternTicks(cur);
  const t = Math.max(-bar, Math.min(len, tick));
  const neg = t < 0;
  const at = neg ? bar + t : t;
  const m = neg ? 0 : Math.floor(at / bar) + 1;
  const beat = Math.floor((at % bar) / 96) + 1;
  const tk = Math.floor(at % 96);
  return (
    <span className="big" data-info="Position|Current measure, beat and tick (96 ticks per beat). Shows the count-in as measure 000.">
      {playing ? `${String(m).padStart(3, '0')}.${String(beat).padStart(2, '0')}.${String(tk).padStart(2, '0')}` : '001.01.00'}
    </span>
  );
};

export const ControlBar = () => {
  const playing = useTransport((t) => t.playing);
  const recording = useTransport((t) => t.recording);
  const voices = useTransport((t) => t.voices);
  const master = useTransport((t) => t.master);
  const recArmed = useApp((s) => s.recArmed);
  const cur = useApp((s) => s.current);
  const queued = useApp((s) => s.queuedId);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const theme = useApp((s) => s.theme);
  const asst = useApp((s) => s.assistantOpen);
  const audioState = useApp((s) => s.audio);
  const song = useApp((s) => s.song);
  const ids = allPatternIds();
  const idx = ids.indexOf(cur.id);
  const step = (d: number) => {
    const id = ids[(idx + d + ids.length) % ids.length];
    if (id) loadPattern(id);
  };
  return (
    <div className="controlbar">
      <div className="logo" data-info="FiveOhFive|A browser groovebox modelled on the MC-505: 8 parts, pattern sequencer, RPS, arpeggiator, Megamix and effects.">
        <span className="mark"><i /><i /><i /><i /></span>FIVEOHFIVE
      </div>
      <div className="sep" />
      <Btn className="big icon" info="Stop|Stops the sequencer. Shift-click for a turntable-style slow-down stop." onClick={(e) => stop(e.shiftKey)} title="Stop">{Icon.stop}</Btn>
      <Btn className="big icon" on={playing} info="Play|Starts the pattern from the top. Space also toggles play." onClick={() => (playing ? stop() : play())} title="Play">{Icon.play}</Btn>
      <Btn className={`big icon${recArmed && !recording ? ' blink' : ''}`} on={recording} info="Record|Arms realtime recording on the selected part. Notes and knob moves you play are recorded while the pattern loops." onClick={toggleRec} title="Record">{Icon.rec}</Btn>
      <Btn
        info="Erase|Hold while recording to erase the record part's events as the playhead passes over them."
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); setErase(true); }}
        onPointerUp={() => setErase(false)}
        style={{ height: 26 }}
      >ERASE</Btn>
      <div className="lcd" style={{ minWidth: 268 }}>
        <Position />
        <span className="dim">|</span>
        <span data-info="Pattern|The pattern being played and edited. An asterisk marks unsaved changes to a preset.">{cur.id} {cur.name}{getState().project.edits[cur.id] ? '*' : ''}</span>
        {queued && <span className="dim">→ {queued}</span>}
        {song && <span className="dim">SONG {song.step + 1}</span>}
      </div>
      <Btn className="icon" info="Previous pattern|Selects the previous pattern. While playing it switches at the end of the current pattern." onClick={() => step(-1)}>{Icon.prev}</Btn>
      <Btn className="icon" info="Next pattern|Selects the next pattern. While playing it switches at the end of the current pattern." onClick={() => step(1)}>{Icon.next}</Btn>
      <div className="sep" />
      <span className="label">BPM</span>
      <NumBox value={cur.tempo} min={20} max={300} step={0.1} width={52} fmt={(v) => v.toFixed(1)} onChange={setTempo} info="Tempo|Pattern tempo in beats per minute. Drag, or double-click to type." />
      <Btn info="Tap tempo|Tap three or more times in time to set the tempo." onClick={tapTempo}>TAP</Btn>
      <span className="label">MEAS</span>
      <NumBox value={cur.measures} min={1} max={32} width={34} onChange={(v) => setLength(v)} info="Measures|Pattern length in measures (1-32). Lengthening loops the existing phrase to fill the new bars." />
      <Select
        value={`${cur.beat[0]}/${cur.beat[1]}`}
        options={BEATS.map((b) => ({ value: `${b[0]}/${b[1]}`, label: `${b[0]}/${b[1]}` }))}
        onChange={(v) => setLength(cur.measures, v.split('/').map(Number) as [number, number])}
        info="Time signature|Beats per measure for this pattern."
      />
      <div className="sep" />
      <Btn className="icon" disabled={!canUndo} info="Undo|Undo the last edit (Ctrl+Z)." onClick={undo}>{Icon.undo}</Btn>
      <Btn className="icon" disabled={!canRedo} info="Redo|Redo (Ctrl+Shift+Z)." onClick={redo}>{Icon.redo}</Btn>
      <span className="grow" />
      <span className="label num" data-info="Voices|Voices currently sounding (64 synth voices plus 40 drum voices).">{voices} VOX</span>
      <div className="row gap2" data-info="Master level|Peak output level, left and right.">
        <Meter value={master[0]} style={{ width: 4, height: 18 }} />
        <Meter value={master[1]} style={{ width: 4, height: 18 }} />
      </div>
      <Btn on={audioState === 'on'} className="icon" info="Audio engine|Starts the audio engine. Browsers need a click before they allow sound." onClick={() => void startAudio()}>{Icon.speaker}</Btn>
      <Btn className="icon" info="Panic|Silences every voice immediately." onClick={panic}>{Icon.panic}</Btn>
      <Btn className="icon" info="Theme|Switch between the dark and light greyscale themes." onClick={() => setState({ theme: theme === 'dark' ? 'light' : 'dark' })}>{theme === 'dark' ? Icon.sun : Icon.moon}</Btn>
      <Btn on={asst} info="Assistant|Opens the AI assistant. Bring your own Anthropic API key; it can write patterns and tweak sounds for you." onClick={() => setState({ assistantOpen: !asst })}>
        {Icon.spark} ASSIST
      </Btn>
    </div>
  );
};

export const InfoView = () => {
  const { t, h } = useInfo();
  return (
    <div className="infoview" aria-live="polite">
      <div className="t">{t}</div>
      <div className="h">{h}</div>
    </div>
  );
};

export const StatusBar = () => {
  const msg = useApp((s) => s.status);
  const audioState = useApp((s) => s.audio);
  const midiIn = useApp((s) => s.project.system.midi.inputId);
  return (
    <div className="statusbar">
      <span className="msg">{msg}</span>
      <span>MIDI IN: {midiIn || 'ALL'}</span>
      <span>AUDIO: {audioState.toUpperCase()}</span>
      <span>
        <span className="kbd">SPACE</span> play <span className="kbd">A–K</span> notes <span className="kbd">Z X</span> octave <span className="kbd">1–7 `</span> part
      </span>
    </div>
  );
};

export const AudioSplash = () => {
  const a = useApp((s) => s.audio);
  if (a === 'on') return null;
  return (
    <div className="splash">
      <div className="card" data-info="Start audio|Browsers only allow sound after you interact with the page.">
        <div className="heading">FIVEOHFIVE</div>
        <div>A groovebox in your browser. Pick a pattern on the left, press play, and twist the knobs.</div>
        <div className="row">
          <Btn className="big" on onClick={() => void startAudio().then(() => togglePlay())}>{Icon.play} START AUDIO AND PLAY</Btn>
          <Btn className="big" onClick={() => void startAudio()}>START AUDIO</Btn>
        </div>
        {a === 'error' && <div className="msg-err">Audio could not start. This app needs a browser with AudioWorklet support (Chrome, Edge, Firefox, Safari 14.1+).</div>}
      </div>
    </div>
  );
};

export const patternLabel = (id: string) => {
  const p = getPattern(id);
  return p ? `${id} ${p.name}` : `${id} (empty)`;
};
