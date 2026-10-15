import { Btn, Knob, Meter, NumBox, Section, Select, VSlider } from '../widgets/widgets';
import { useApp, useTransport, setPart, setState, setSystem, edit, setIn } from '../../store/store';
import { partName } from '../../model/defaults';
import { NUM_PARTS } from '../../model/types';
import { EFX_DEFS, EFX_MAP, RATE_OPTIONS } from '../../model/efxDefs';
import type { DelaySetup, ReverbSetup } from '../../model/types';
import { SYNC_VALUES } from '../../engine/dsp/math';

const Strip = ({ i }: { i: number }) => {
  const p = useApp((s) => s.current.parts[i]);
  const sel = useApp((s) => s.part === i);
  const kitRef = useApp((s) => s.current.kitRef);
  const meter = useTransport((t) => t.meters[i]);
  const solo = useApp((s) => s.current.parts.every((q, k) => (k === i ? !q.mute : q.mute)));
  return (
    <div className={`section`} style={{ width: 92, flexShrink: 0 }}>
      <div className="sh" style={sel ? { background: 'var(--hi)', color: 'var(--hi-text)' } : undefined} onClick={() => setState({ part: i })} data-info={`Part ${partName(i)}|Click to select.`}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{partName(i)}</span>
        <span className="grow" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 58 }}>{i === 0 ? kitRef : p.patchRef}</span>
      </div>
      <div className="sb col gap4" style={{ alignItems: 'center' }}>
        <Knob label="PAN" value={p.pan} min={-64} max={63} bipolar def={0} onChange={(v) => setPart(i, { pan: v })} info="Pan|Stereo position." />
        <Knob label="REV" value={p.rev} def={30} onChange={(v) => setPart(i, { rev: v })} info="Reverb send|Amount sent to the reverb." />
        <Knob label="DLY" value={p.dly} def={0} onChange={(v) => setPart(i, { dly: v })} info="Delay send|Amount sent to the delay." />
        {i > 0 ? <Knob label="KEY" value={p.key} min={-48} max={48} bipolar def={0} onChange={(v) => setPart(i, { key: v })} info="Key shift|Transposes the part." /> : <div style={{ height: 52 }} />}
        <div className="row" style={{ gap: 4, alignItems: 'flex-end' }}>
          <VSlider value={p.level} max={127} def={100} onChange={(v) => setPart(i, { level: v }, `lvl${i}`)} height={110} info="Level|Part volume." />
          <Meter value={meter} style={{ width: 6, height: 110 }} />
        </div>
        <span className="num">{p.level}</span>
        <div className="row gap2">
          <Btn on={p.mute} onClick={() => setPart(i, { mute: !p.mute })} info="Mute|Silences the part.">M</Btn>
          <Btn on={solo} onClick={() => edit((pt) => ({ ...pt, parts: pt.parts.map((q, k) => ({ ...q, mute: solo ? false : k !== i })) }))} info="Solo|Mutes every other part. Click again to unmute all.">S</Btn>
          <Btn on={p.efx} onClick={() => setPart(i, { efx: !p.efx })} info="EFX|Routes the part through the multi-effect.">FX</Btn>
        </div>
        <div className="row gap2"><span className="label">CH</span><NumBox value={p.midiCh} min={1} max={16} width={32} onChange={(v) => setPart(i, { midiCh: v })} info="MIDI channel|Channel this part listens and sends on." /></div>
      </div>
    </div>
  );
};

export const MixerView = () => {
  const sys = useApp((s) => s.project.system);
  const master = useTransport((t) => t.master);
  return (
    <div className="col gap8">
      <div className="row gap4" style={{ alignItems: 'stretch', overflowX: 'auto' }}>
        {Array.from({ length: NUM_PARTS }, (_, i) => <Strip key={i} i={i} />)}
        <div className="section" style={{ width: 120, flexShrink: 0 }}>
          <div className="sh">MASTER</div>
          <div className="sb col gap4" style={{ alignItems: 'center' }}>
            <Btn on={sys.lowBoost.on} onClick={() => setSystem({ lowBoost: { ...sys.lowBoost, on: !sys.lowBoost.on } })} info="Low boost|Bass shelf on the master output.">LOW BOOST</Btn>
            <div className="row" style={{ gap: 0 }}>
              <Knob label="FREQ" value={sys.lowBoost.freq} min={30} max={200} def={80} onChange={(freq) => setSystem({ lowBoost: { ...sys.lowBoost, freq } })} info="Low boost frequency|Shelf corner in Hz." />
              <Knob label="GAIN" value={sys.lowBoost.gain} min={0} max={12} def={6} onChange={(gain) => setSystem({ lowBoost: { ...sys.lowBoost, gain } })} info="Low boost gain|Boost in dB." />
            </div>
            <Knob label="METRO" value={sys.metroLevel} def={80} onChange={(metroLevel) => setSystem({ metroLevel })} info="Metronome level|Click volume." />
            <div className="row" style={{ gap: 4, alignItems: 'flex-end' }}>
              <VSlider value={sys.masterLevel} def={100} onChange={(masterLevel) => setSystem({ masterLevel })} height={110} info="Master|Output level." />
              <Meter value={master[0]} style={{ width: 6, height: 110 }} />
              <Meter value={master[1]} style={{ width: 6, height: 110 }} />
            </div>
            <span className="num">{sys.masterLevel}</span>
          </div>
        </div>
      </div>
      <EffectsView compact />
    </div>
  );
};

const REVERB_TYPES: ReverbSetup['type'][] = ['room1', 'room2', 'stage', 'hall1', 'hall2', 'plate', 'delay', 'panDelay'];
const DELAY_TYPES: DelaySetup['type'][] = ['mono', 'stereo', 'pingpong'];

export const EffectsView = ({ compact }: { compact?: boolean }) => {
  const fx = useApp((s) => s.current.fx);
  const parts = useApp((s) => s.current.parts);
  const def = EFX_MAP[fx.efx.type];
  const setEfx = (k: string, v: number) => edit((p) => setIn(p, ['fx', 'efx', 'params', k], v), `efx${k}`);
  const ef = (path: (string | number)[], v: unknown, key: string) => edit((p) => setIn(p, ['fx', ...path], v), key);
  return (
    <div className="col gap8">
      <Section title="MULTI-EFFECT (EFX)" info={`EFX|${def.help}`} right={<span className="dim">{def.help}</span>}>
        <div className="col gap8">
          <div className="row gap8 wrap">
            <Select value={fx.efx.type} options={EFX_DEFS.map((d) => ({ value: d.type, label: d.name }))} onChange={(t) => edit((p) => setIn(p, ['fx', 'efx'], { ...p.fx.efx, type: t, params: {} }), 'efxtype')} info="EFX type|Choose one of 25 multi-effects." />
            <span className="label">PARTS →</span>
            {parts.map((p, i) => (
              <Btn key={i} on={p.efx} onClick={() => setPart(i, { efx: !p.efx })} info={`Part ${partName(i)} → EFX|Routes this part through the multi-effect.`}>{partName(i)}</Btn>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 0 }}>
            {def.params.map((pd) => {
              const v = fx.efx.params[pd.key] ?? pd.def;
              if (pd.options && pd.options.length > 5)
                return (
                  <div key={pd.key} className="field" style={{ margin: '0 4px', alignSelf: 'center' }} data-info={`${pd.label}|${pd.help}`}>
                    <span className="label">{pd.label}</span>
                    <Select value={v} options={pd.options.map((o, k) => ({ value: k, label: o }))} onChange={(x) => setEfx(pd.key, x)} />
                  </div>
                );
              return <Knob key={pd.key} label={pd.label} value={v} min={pd.min} max={pd.max} def={pd.def} bipolar={pd.min < 0} fmt={(x) => (pd.options ? pd.options[x] ?? String(x) : String(x))} onChange={(x) => setEfx(pd.key, x)} info={`${pd.label}${def.ctrl.includes(pd.key) ? ' (EFX CTRL)' : ''}|${pd.help}`} />;
            })}
            <div className="sep" />
            <Knob label="OUTPUT" value={fx.efx.level} def={127} onChange={(v) => ef(['efx', 'level'], v, 'efxlvl')} info="EFX output|Level of the effect output." />
            <Knob label="→ REV" value={fx.efx.rev} def={0} onChange={(v) => ef(['efx', 'rev'], v, 'efxrev')} info="EFX to reverb|Send from the EFX output to the reverb." />
            <Knob label="→ DLY" value={fx.efx.dly} def={0} onChange={(v) => ef(['efx', 'dly'], v, 'efxdly')} info="EFX to delay|Send from the EFX output to the delay." />
          </div>
        </div>
      </Section>
      <div className={compact ? 'row gap8' : 'grid2'}>
        <Section title="REVERB" info="Reverb|Shared reverb fed by each part's REV send." style={{ flex: 1 }}>
          <div className="row wrap" style={{ gap: 0, alignItems: 'center' }}>
            <Select value={fx.reverb.type} options={REVERB_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))} onChange={(v) => ef(['reverb', 'type'], v, 'revtype')} info="Reverb type|Room, stage, hall, plate, or the echo-style DELAY and PAN DELAY types." />
            <Knob label="TIME" value={fx.reverb.time} def={70} onChange={(v) => ef(['reverb', 'time'], v, 'revtime')} info="Reverb time|Decay length (delay time for the delay types)." />
            <Knob label="HF DAMP" value={fx.reverb.hfDamp} def={60} onChange={(v) => ef(['reverb', 'hfDamp'], v, 'revdamp')} info="HF damp|Darkens the reverb tail." />
            <Knob label="PRE DLY" value={fx.reverb.preDelay} def={10} onChange={(v) => ef(['reverb', 'preDelay'], v, 'revpre')} info="Pre-delay|Gap before the reverb starts (feedback for the delay types)." />
            <Knob label="LEVEL" value={fx.reverb.level} def={90} onChange={(v) => ef(['reverb', 'level'], v, 'revlvl')} info="Reverb level|Return level." />
          </div>
        </Section>
        <Section title="DELAY" info="Delay|Shared tempo-synced delay fed by each part's DLY send." style={{ flex: 1 }}>
          <div className="row wrap" style={{ gap: 0, alignItems: 'center' }}>
            <div className="col gap4">
              <Select value={fx.delay.type} options={DELAY_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))} onChange={(v) => ef(['delay', 'type'], v, 'dlytype')} info="Delay type|Mono, stereo, or ping-pong bouncing between left and right." />
              <Select value={fx.delay.sync} options={SYNC_VALUES.map((t) => ({ value: t, label: t === 'off' ? 'MS' : t }))} onChange={(v) => ef(['delay', 'sync'], v, 'dlysync')} info="Delay sync|Delay time as a note value; MS uses the TIME knob." />
            </div>
            {fx.delay.sync === 'off' && <Knob label="TIME MS" value={fx.delay.timeMs} min={1} max={1000} def={300} onChange={(v) => ef(['delay', 'timeMs'], v, 'dlyms')} info="Delay time|In milliseconds." />}
            <Knob label="FEEDBACK" value={fx.delay.feedback} def={50} onChange={(v) => ef(['delay', 'feedback'], v, 'dlyfb')} info="Feedback|Number of repeats." />
            <Knob label="HF DAMP" value={fx.delay.hfDamp} def={60} onChange={(v) => ef(['delay', 'hfDamp'], v, 'dlydamp')} info="HF damp|Darkens each repeat." />
            <Knob label="→ REV" value={fx.delay.toReverb} def={20} onChange={(v) => ef(['delay', 'toReverb'], v, 'dlyrev')} info="Delay to reverb|Sends the echoes into the reverb." />
            <Knob label="LEVEL" value={fx.delay.level} def={90} onChange={(v) => ef(['delay', 'level'], v, 'dlylvl')} info="Delay level|Return level." />
          </div>
        </Section>
      </div>
      {!compact && <div className="dim">EFX rate options: {RATE_OPTIONS.join(' · ')}</div>}
    </div>
  );
};
