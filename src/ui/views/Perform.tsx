import { useEffect, useRef, useState } from 'react';
import { Btn, Knob, Section, Select, Seg, Meter } from '../widgets/widgets';
import {
  useApp, useTransport, setState, setPart, edit, noteOn, noteOff, rpsPad, megamixToggle, sendCc, setArp, setSystem,
  getTransport, allPatternIds, getPattern, stop, tapTempo, type PadMode, setIn, getState,
} from '../../store/store';
import { audio } from '../../engine/audio';
import { EFX_DEFS, EFX_MAP } from '../../model/efxDefs';
import { measureTicks, partName } from '../../model/defaults';
import type { DBeamTarget, Realtime } from '../../model/types';
import { PAD_NOTES, DRUM_NOTE_NAMES } from '../../presets/kits';
import { ARP_STYLES, BEAT_PATTERNS } from '../../presets/arp';
import { noteName } from '../../model/notation';
import { insertEvents } from '../../model/edit';
import { useMobile } from '../useMobile';

export const PartStrip = () => {
  const parts = useApp((s) => s.current.parts);
  const kitRef = useApp((s) => s.current.kitRef);
  const sel = useApp((s) => s.part);
  const meters = useTransport((t) => t.meters);
  return (
    <div className="parts">
      {parts.map((p, i) => (
        <div
          key={i}
          className={`partcell${sel === i ? ' on' : ''}${p.mute ? ' muted' : ''}`}
          onClick={() => setState({ part: i })}
          data-info={`Part ${partName(i)}|Click to select this part for editing, the keyboard and the realtime knobs. ${i === 0 ? 'R is the rhythm part.' : ''}`}
        >
          <div className="row">
            <span className="pname">{partName(i)}</span>
            <span className="grow" />
            <button
              type="button"
              className={`btn${p.mute ? ' on' : ''}`}
              style={{ height: 16, minWidth: 16, padding: '0 3px', fontSize: 9 }}
              onClick={(e) => { e.stopPropagation(); setPart(i, { mute: !p.mute }); }}
              data-info={`Mute ${partName(i)}|Silences this part. Mute moves are recorded when recording in PART MUTE pad mode.`}
            >M</button>
          </div>
          <div className="ppatch">{i === 0 ? kitRef || 'NO KIT' : p.patchRef}</div>
          <div className="act"><div style={{ width: `${Math.min(100, meters[i] * 160)}%` }} /></div>
        </div>
      ))}
    </div>
  );
};

const RT_KNOBS: { key: keyof Realtime; label: string; cc: number; help: string }[] = [
  { key: 'cutoff', label: 'CUTOFF', cc: 74, help: 'Opens and closes the filter of the selected part.' },
  { key: 'resonance', label: 'RESO', cc: 71, help: 'Adds emphasis at the cutoff frequency.' },
  { key: 'envDepth', label: 'ENV', cc: 78, help: 'How far the filter envelope sweeps the cutoff.' },
  { key: 'attack', label: 'ATTACK', cc: 73, help: 'Lengthens or shortens the attack of new notes.' },
  { key: 'decay', label: 'DECAY', cc: 75, help: 'Lengthens or shortens the decay of new notes.' },
  { key: 'release', label: 'RELEASE', cc: 72, help: 'Lengthens or shortens the release of new notes.' },
  { key: 'lfoRate', label: 'LFO RATE', cc: 76, help: 'Speed of LFO 1.' },
  { key: 'lfoDepth', label: 'LFO DEPTH', cc: 77, help: 'Adds LFO 1 modulation to pitch and filter.' },
  { key: 'pitch', label: 'PITCH', cc: 79, help: 'Fine pitch offset in cents.' },
];

export const RealtimeKnobs = () => {
  const part = useApp((s) => s.part);
  const rt = useApp((s) => s.current.parts[s.part].rt);
  const set = (k: keyof Realtime, v: number, cc: number) => {
    setPart(part, { rt: { ...rt, [k]: v } }, `rt${part}${k}`);
    if (getTransport().recording) sendCc(part, cc, v + 64);
  };
  return (
    <Section title={`REALTIME MODIFY · PART ${partName(part)}`} info="Realtime modify|Offsets applied on top of the selected part's patch. Knob moves are recorded as controller data while recording." right={<Btn onClick={() => setPart(part, { rt: { cutoff: 0, resonance: 0, envDepth: 0, attack: 0, decay: 0, release: 0, lfoRate: 0, lfoDepth: 0, pitch: 0 } })} info="Reset|Centres all realtime knobs for this part.">RESET</Btn>}>
      <div className="row wrap" style={{ gap: 2 }}>
        {RT_KNOBS.map((k) => (
          <Knob key={k.key} lg label={k.label} value={rt[k.key]} min={-63} max={63} def={0} bipolar onChange={(v) => set(k.key, v, k.cc)}
            info={`${k.label}|${part === 0 ? (k.key === 'cutoff' ? 'On the rhythm part this is a DJ filter: left for lowpass, right for highpass.' : k.key === 'resonance' ? 'Resonance of the rhythm part DJ filter.' : 'Synth parts only.') : k.help}`}
            disabled={part === 0 && k.key !== 'cutoff' && k.key !== 'resonance'} />
        ))}
      </div>
    </Section>
  );
};

export const EffectKnobs = () => {
  const fx = useApp((s) => s.current.fx);
  const part = useApp((s) => s.part);
  const partEfx = useApp((s) => s.current.parts[s.part].efx);
  const master = useApp((s) => s.project.system.masterLevel);
  const lowBoost = useApp((s) => s.project.system.lowBoost);
  const def = EFX_MAP[fx.efx.type];
  const ctrlParam = (i: 0 | 1) => def.params.find((p) => p.key === def.ctrl[i])!;
  const pv = (key: string) => fx.efx.params[key] ?? def.params.find((p) => p.key === key)?.def ?? 0;
  return (
    <Section title="EFFECTS" info="Effects|The multi-effect (EFX), reverb and delay shared by all parts.">
      <div className="row wrap" style={{ gap: 6, alignItems: 'flex-start' }}>
        <div className="col gap4" style={{ width: 128 }}>
          <Select
            value={fx.efx.type}
            options={EFX_DEFS.map((d) => ({ value: d.type, label: d.name }))}
            onChange={(t) => edit((p) => setIn(p, ['fx', 'efx'], { ...p.fx.efx, type: t, params: {} }), 'efxtype')}
            info={`EFX type|${def.help}`}
          />
          <Btn on={partEfx} onClick={() => setPart(part, { efx: !partEfx })} info={`EFX on part ${partName(part)}|Routes the selected part through the multi-effect.`}>PART {partName(part)} → EFX</Btn>
        </div>
        {[0, 1].map((i) => {
          const pd = ctrlParam(i as 0 | 1);
          return (
            <Knob key={i} lg label={`CTRL${i + 1} ${pd.label}`} value={pv(pd.key)} min={pd.min} max={pd.max} def={pd.def} fmt={(v) => (pd.options ? pd.options[v] ?? String(v) : String(v))}
              onChange={(v) => edit((p) => setIn(p, ['fx', 'efx', 'params', pd.key], v), `efx${pd.key}`)} info={`EFX CTRL ${i + 1}: ${pd.label}|${pd.help}`} />
          );
        })}
        <Knob lg label="REVERB" value={fx.reverb.level} def={90} onChange={(v) => edit((p) => setIn(p, ['fx', 'reverb', 'level'], v), 'revlvl')} info="Reverb level|Overall reverb return level." />
        <Knob lg label="DELAY" value={fx.delay.level} def={90} onChange={(v) => edit((p) => setIn(p, ['fx', 'delay', 'level'], v), 'dlylvl')} info="Delay level|Overall delay return level." />
        <Knob lg label="DLY FB" value={fx.delay.feedback} def={50} onChange={(v) => edit((p) => setIn(p, ['fx', 'delay', 'feedback'], v), 'dlyfb')} info="Delay feedback|Number of delay repeats." />
        <div className="sep" />
        <Knob lg label="MASTER" value={master} def={100} onChange={(v) => setSystem({ masterLevel: v })} info="Master volume|Final output level." />
        <div className="col gap4">
          <Btn on={lowBoost.on} onClick={() => setSystem({ lowBoost: { ...lowBoost, on: !lowBoost.on } })} info="Low boost|Adds a bass shelf to the master output, like the hardware LOW BOOST button.">LOW BOOST</Btn>
          <Btn onClick={tapTempo} info="Tap tempo|Tap in time to set the tempo.">TAP</Btn>
          <Btn onClick={() => stop(true)} info="Turntable stop|Stops the sequencer like a turntable powering down, pitching everything down.">TURNTABLE</Btn>
        </div>
      </div>
    </Section>
  );
};

const DBeam = () => {
  const target = useApp((s) => s.project.system.dbeam);
  const all = useApp((s) => s.project.system.dbeamAllParts);
  const [v, setV] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const val = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    setV(val);
    audio.send({ type: 'dbeam', value: val });
  };
  const leave = () => {
    setV(null);
    audio.send({ type: 'dbeam', value: null });
  };
  const opts: { value: DBeamTarget; label: string }[] = [
    { value: 'cutoff', label: 'CUTOFF' }, { value: 'resonance', label: 'RESO' }, { value: 'cutoff+res', label: 'CUT+RES' }, { value: 'pitchUp', label: 'PITCH UP' },
    { value: 'pitchDown', label: 'PITCH DN' }, { value: 'lfoDepth', label: 'LFO DEPTH' }, { value: 'efx1', label: 'EFX CTRL1' }, { value: 'efx2', label: 'EFX CTRL2' },
    { value: 'level', label: 'VOLUME' }, { value: 'reverb', label: 'REV SEND' }, { value: 'delay', label: 'DLY SEND' }, { value: 'off', label: 'OFF' },
  ];
  return (
    <div className="col gap4 dbeam-col" style={{ width: 76 }}>
      <div ref={ref} className="dbeam grow" style={{ width: '100%', minHeight: 116 }} onPointerMove={move} onPointerLeave={leave} onPointerUp={leave} onPointerDown={move}
        data-info="D-Beam|Move the pointer over the beam to control the assigned parameter. Moving away returns it to normal.">
        <div className="lbl">D-BEAM</div>
        <div className={`beam${v !== null ? ' on' : ''}`} style={{ height: `${(v ?? 0) * 100}%` }} />
      </div>
      <Select value={target} options={opts} onChange={(t) => setSystem({ dbeam: t })} info="D-Beam assign|What the D-Beam controls." />
      <Btn on={all} onClick={() => setSystem({ dbeamAllParts: !all })} info="D-Beam all parts|Apply the D-Beam to every part instead of only the selected one.">ALL PARTS</Btn>
    </div>
  );
};

const ArpBlock = () => {
  const arp = useApp((s) => s.project.arp);
  const part = useApp((s) => s.part);
  return (
    <Section title="ARPEGGIATOR" info="Arpeggiator|Turns held notes on the selected part into patterns, locked to the tempo." style={{ minWidth: 200 }}>
      <div className="col gap4">
        <div className="row gap4">
          <Btn on={arp.on} onClick={() => setArp({ on: !arp.on })} info={`Arpeggio on|Arpeggiates notes played on part ${partName(part)}.`} disabled={part === 0}>ARP</Btn>
          <Btn on={arp.hold} onClick={() => setArp({ hold: !arp.hold })} info="Hold|Keeps arpeggiating after you let go of the keys.">HOLD</Btn>
          <Select value={arp.rate} options={['1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'].map((r) => ({ value: r as typeof arp.rate, label: r }))} onChange={(rate) => setArp({ rate })} info="Rate|Step length of the arpeggio." />
        </div>
        <Select value={arp.style} options={ARP_STYLES.map((s) => ({ value: s.id, label: s.name }))} onChange={(style) => setArp({ style })} info={`Style|${ARP_STYLES.find((s) => s.id === arp.style)?.help ?? ''}`} />
        <Select value={arp.beat} options={BEAT_PATTERNS.map((s) => ({ value: s.id, label: `BEAT: ${s.name}` }))} onChange={(beat) => setArp({ beat })} info="Beat pattern|Rhythm that decides which steps play." />
        <div className="row" style={{ gap: 0 }}>
          <Knob label="OCT" value={arp.octaves} min={-3} max={3} def={1} onChange={(octaves) => setArp({ octaves })} info="Octave range|Number of octaves the arpeggio spans; negative goes down." />
          <Knob label="GATE" value={arp.gate} min={1} max={100} def={60} onChange={(gate) => setArp({ gate })} info="Gate|Length of each note as a percentage of the step." />
          <Knob label="ACCENT" value={arp.accent} min={0} max={100} def={30} onChange={(accent) => setArp({ accent })} info="Accent|Difference between accented and normal steps." />
          <Knob label="SHUF" value={arp.shuffle} min={0} max={100} def={0} onChange={(shuffle) => setArp({ shuffle })} info="Shuffle|Swing on every second step." />
        </div>
      </div>
    </Section>
  );
};

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK = [1, 3, -1, 6, 8, 10, -2, 13];

const Pads = () => {
  const mode = useApp((s) => s.padMode);
  const part = useApp((s) => s.part);
  const octave = useApp((s) => s.octave);
  const cur = useApp((s) => s.current);
  const rps = useApp((s) => s.project.rps);
  const megaSource = useApp((s) => s.megaSource);
  const megaParts = useApp((s) => s.megaParts);
  const trPage = useApp((s) => s.trPage);
  const trNote = useApp((s) => s.trNote);
  const rpsActive = useTransport((t) => t.rpsActive);
  const mobile = useMobile();
  const drumHits = useTransport((t) => t.drumHits);
  const tick = useTransport((t) => t.tick);
  const playing = useTransport((t) => t.playing);
  const [down, setDown] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!drumHits.length) return;
    setFlash(new Set(drumHits));
    const t = setTimeout(() => setFlash(new Set()), 90);
    return () => clearTimeout(t);
  }, [drumHits]);

  const press = (i: number, on: boolean, e?: React.PointerEvent, vel = 100) => {
    const nd = new Set(down);
    if (on) nd.add(i); else nd.delete(i);
    setDown(nd);
    if (mode === 'keyboard') {
      if (part === 0) {
        const note = PAD_NOTES[i];
        if (on) noteOn(0, note, vel);
        return;
      }
      const row = i < 8 ? BLACK : WHITE;
      const k = row[i % 8];
      if (k === -1) { if (on) setState({ octave: Math.max(0, octave - 1) }); return; }
      if (k === -2) { if (on) setState({ octave: Math.min(8, octave + 1) }); return; }
      const note = (octave + 1) * 12 + k;
      if (on) noteOn(part, note, vel); else noteOff(part, note);
    } else if (mode === 'rps') {
      rpsPad(i, on);
    } else if (on && mode === 'mute' && i < 8) {
      const muted = !cur.parts[i].mute;
      setPart(i, { mute: muted });
      const tr = getTransport();
      if (tr.recording && tr.playing && tr.tick >= 0) edit((p) => ({ ...p, muteTrack: [...p.muteTrack, { t: Math.round(tr.tick), part: i, mute: muted }].sort((a, b) => a.t - b.t) }), 'mutrec');
    } else if (on && mode === 'megamix' && i < 8) {
      megamixToggle(i);
    } else if (on && mode === 'trrec') {
      const bar = measureTicks(cur);
      const stepT = bar / 16;
      const t = Math.round(trPage * bar + i * stepT);
      const note = part === 0 ? trNote : trNote;
      const tr = cur.tracks[part];
      const exists = tr.find((ev) => ev.k === 'n' && ev.t === t && ev.n === note);
      const next = exists ? tr.filter((ev) => ev !== exists) : insertEvents(tr, [{ t, k: 'n', n: note, v: e?.shiftKey ? 125 : 100, g: Math.round(stepT * (part === 0 ? 0.5 : 0.9)) }]);
      edit((p) => setIn(p, ['tracks', part], next), '');
      if (!exists) { noteOn(part, note, 100); setTimeout(() => noteOff(part, note), 120); }
    }
  };

  const bar = measureTicks(cur);
  const stepT = bar / 16;
  const curStep = playing && tick >= 0 ? Math.floor(tick / stepT) : -1;
  const label = (i: number): [string, string, string] => {
    // [className extras, top label, main label]
    if (mode === 'keyboard') {
      if (part === 0) {
        const n = PAD_NOTES[i];
        const inst = cur.kit.insts.find((d) => d.note === n);
        return [flash.has(n) ? ' hit' : '', String(n), inst?.name ?? DRUM_NOTE_NAMES[n] ?? '—'];
      }
      const row = i < 8 ? BLACK : WHITE;
      const k = row[i % 8];
      if (k === -1) return [' mid', '', 'OCT −'];
      if (k === -2) return [' mid', '', 'OCT +'];
      return [i < 8 ? ' black' : '', '', noteName((octave + 1) * 12 + k)];
    }
    if (mode === 'rps') {
      const s = rps.slots[i];
      return [rpsActive.includes(i) ? ' on' : s ? '' : ' dashed', `RPS ${i + 1}`, s ? `${s.patternId}:${partName(s.part)}→${partName(s.target)}` : 'EMPTY'];
    }
    if (mode === 'mute') {
      if (i >= 8) return [' dashed', '', ''];
      return [cur.parts[i].mute ? '' : ' on', `PART ${partName(i)}`, cur.parts[i].mute ? 'MUTED' : 'ON'];
    }
    if (mode === 'megamix') {
      if (i >= 8) return [' dashed', '', ''];
      return [megaParts[i] ? ' on' : '', `PART ${partName(i)}`, megaParts[i] ? `FROM ${megaSource}` : 'ORIGINAL'];
    }
    // TR-REC
    const t = Math.round(trPage * bar + i * stepT);
    const ev = cur.tracks[part].find((e) => e.k === 'n' && e.n === trNote && e.t >= t && e.t < t + stepT);
    const playingHere = curStep >= 0 && curStep % (16 * cur.measures) === trPage * 16 + i;
    const vel = ev && ev.k === 'n' ? ev.v : 0;
    return [`${ev ? (vel > 110 ? ' on' : ' mid') : ''}${playingHere ? ' cur' : ''}`, `${i + 1}`, ev ? (vel > 110 ? 'ACCENT' : 'NOTE') : ''];
  };

  const drumOpts = cur.kit.insts.map((d) => ({ value: d.note, label: `${d.note} ${d.name}` }));
  const controls = (
    <div className="row gap4 wrap">
      {mode === 'trrec' && (
        <>
          {part === 0 ? (
            <Select value={trNote} options={drumOpts} onChange={(n) => setState({ trNote: n })} info="TR-REC instrument|Which drum the step pads write." />
          ) : (
            <Select value={trNote} options={Array.from({ length: 61 }, (_, k) => ({ value: 24 + k, label: noteName(24 + k) }))} onChange={(n) => setState({ trNote: n })} info="TR-REC note|Which note the step pads write on this part." />
          )}
          <Select value={trPage} options={Array.from({ length: cur.measures }, (_, k) => ({ value: k, label: `MEAS ${k + 1}` }))} onChange={(v) => setState({ trPage: v })} info="TR-REC measure|Which measure the 16 step pads show." />
        </>
      )}
      {mode === 'megamix' && (
        <Select value={megaSource ?? ''} options={[{ value: '', label: 'SOURCE…' }, ...allPatternIds().map((id) => ({ value: id, label: `${id} ${getPattern(id)?.name ?? ''}` }))]} onChange={(v) => setState({ megaSource: v || null })} info="Megamix source|Pattern whose parts the pads swap in." />
      )}
      <Seg<PadMode>
        value={mode}
        onChange={(m) => setState({ padMode: m, trNote: m === 'trrec' ? (part === 0 ? 36 : 48) : getState().trNote })}
        options={[{ value: 'keyboard', label: mobile ? 'KEYS' : 'KEYBOARD' }, { value: 'trrec', label: 'TR-REC' }, { value: 'rps', label: 'RPS' }, { value: 'mute', label: mobile ? 'MUTE' : 'PART MUTE' }, { value: 'megamix', label: mobile ? 'MEGA' : 'MEGAMIX' }]}
        info="Pad mode|KEYBOARD plays notes, TR-REC programs steps, RPS triggers phrases, PART MUTE mutes parts, MEGAMIX swaps in parts from another pattern."
      />
    </div>
  );
  // On a 4x4 phone grid, interleave the keyboard rows so each black-key row sits above its white keys.
  const order = mobile && mode === 'keyboard' && part !== 0 ? [0, 1, 2, 3, 8, 9, 10, 11, 4, 5, 6, 7, 12, 13, 14, 15] : Array.from({ length: 16 }, (_, k) => k);
  return (
    <Section title="PADS" info="Pads|Sixteen velocity-sensitive pads. Their role depends on the pad mode." right={mobile ? undefined : controls}>
      {mobile && <div style={{ marginBottom: 6 }}>{controls}</div>}
      <div className="pads">
        {order.map((i) => {
          const [cls, top, main] = label(i);
          return (
            <div
              key={i}
              className={`pad${cls}${down.has(i) ? ' hit' : ''}`}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.setPointerCapture?.(e.pointerId);
                press(i, true, e, Math.round(127 - 57 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))));
              }}
              onPointerUp={() => press(i, false)}
              onPointerCancel={() => press(i, false)}
              data-info={`Pad ${i + 1}|${mode === 'keyboard' ? 'Plays a note; strike near the top for more velocity.' : mode === 'trrec' ? 'Toggles a step. Shift-click writes an accent.' : mode === 'rps' ? 'Hold to play the assigned phrase in time.' : mode === 'mute' ? 'Toggles the part on and off.' : 'Swaps this part with the one from the Megamix source pattern.'}`}
            >
              <span className="pn">{top}</span>
              <span className="pl">{main}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
};

const Scope = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(1024);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      const an = audio.analyser;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const w = (c.width = c.clientWidth * devicePixelRatio);
      const h = (c.height = c.clientHeight * devicePixelRatio);
      const css = getComputedStyle(document.documentElement);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = css.getPropertyValue('--line');
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      if (!an) return;
      an.getFloatTimeDomainData(buf);
      let start = 0;
      for (let i = 1; i < 512; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
      ctx.strokeStyle = css.getPropertyValue('--text');
      ctx.lineWidth = 1.2 * devicePixelRatio;
      ctx.beginPath();
      for (let i = 0; i < 512; i++) {
        const x = (i / 511) * w;
        const y = h / 2 - buf[start + i] * h * 0.45;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="canvas-wrap" style={{ height: 52 }} data-info="Scope|Master output waveform."><canvas ref={ref} style={{ width: '100%', height: '100%' }} /></div>;
};

const PartMixMini = () => {
  const part = useApp((s) => s.part);
  const p = useApp((s) => s.current.parts[s.part]);
  const meter = useTransport((t) => t.meters[getState().part]);
  return (
    <Section title={`PART ${partName(part)} MIX`} info="Part mix|Level, pan and sends of the selected part.">
      <div className="row" style={{ gap: 0, alignItems: 'flex-end' }}>
        <Knob label="LEVEL" value={p.level} def={100} onChange={(v) => setPart(part, { level: v })} info="Part level|Volume of the selected part." />
        <Knob label="PAN" value={p.pan} min={-64} max={63} def={0} bipolar onChange={(v) => setPart(part, { pan: v })} info="Part pan|Stereo position of the selected part." />
        <Knob label="REV" value={p.rev} def={30} onChange={(v) => setPart(part, { rev: v })} info="Reverb send|How much of this part goes to the reverb." />
        <Knob label="DLY" value={p.dly} def={0} onChange={(v) => setPart(part, { dly: v })} info="Delay send|How much of this part goes to the delay." />
        <Knob label="KEY" value={p.key} min={-48} max={48} def={0} bipolar onChange={(v) => setPart(part, { key: v })} info="Key shift|Transposes the part in semitones." disabled={part === 0} />
        <Meter value={meter} style={{ width: 6, height: 44, marginLeft: 6, marginBottom: 14 }} />
      </div>
    </Section>
  );
};

export const PerformView = () => {
  const mobile = useMobile();
  if (mobile)
    // phones: the pads are the instrument, so they come first
    return (
      <div className="col gap8 perform-m">
        <PartStrip />
        <Pads />
        <RealtimeKnobs />
        <PartMixMini />
        <EffectKnobs />
        <div className="row gap8 perform-bottom" style={{ alignItems: 'stretch' }}>
          <DBeam />
          <ArpBlock />
        </div>
        <Scope />
      </div>
    );
  return (
    <div className="col gap8">
      <PartStrip />
      <div className="row gap8" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        <RealtimeKnobs />
        <PartMixMini />
      </div>
      <EffectKnobs />
      <div className="row gap8 perform-bottom" style={{ alignItems: 'stretch' }}>
        <div className="col gap8 grow">
          <Pads />
          <Scope />
        </div>
        <DBeam />
        <ArpBlock />
      </div>
    </div>
  );
};
