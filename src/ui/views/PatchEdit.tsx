import { Btn, Knob, Section, Select, TextInput } from '../widgets/widgets';
import { useApp, editPath, getIn, setState, writeUserPatch, setPatch, edit, setIn } from '../../store/store';
import type { ModEnv, AmpEnv, Patch, Tone } from '../../model/types';
import { PATCH_PARAMS, TONE_PARAMS, paramInfo, type ParamDesc } from '../../model/params';
import { WAVES, waveDef } from '../../engine/dsp/waves';
import { SYNC_VALUES, envTime } from '../../engine/dsp/math';
import { clone, defaultPatch, partName } from '../../model/defaults';
import { patchCategories } from '../../presets/patches';

const TP: Record<string, ParamDesc> = Object.fromEntries(TONE_PARAMS.map((p) => [p.key, p]));
const PP: Record<string, ParamDesc> = Object.fromEntries(PATCH_PARAMS.map((p) => [p.key, p]));

const ToneKnob = ({ part, t, k, label, bipolar }: { part: number; t: 0 | 1; k: string; label?: string; bipolar?: boolean }) => {
  const d = TP[k];
  const v = useApp((s) => getIn(s.current.parts[part].patch.tones[t], k.split('.')) as number);
  return (
    <Knob
      label={label ?? d.label.replace(/^(P-ENV|F-ENV|A-ENV|LFO1|LFO2) /, '')}
      value={v}
      min={d.min}
      max={d.max}
      def={d.min < 0 ? 0 : undefined}
      bipolar={bipolar ?? d.min < 0}
      onChange={(x) => editPath(['parts', part, 'patch', 'tones', t, ...k.split('.')], x)}
      info={paramInfo(d)}
    />
  );
};

const ToneToggle = ({ part, t, k, label }: { part: number; t: 0 | 1; k: string; label: string }) => {
  const d = TP[k];
  const v = useApp((s) => getIn(s.current.parts[part].patch.tones[t], k.split('.')) as boolean);
  return <Btn on={v} onClick={() => editPath(['parts', part, 'patch', 'tones', t, ...k.split('.')], !v)} info={paramInfo(d)}>{label}</Btn>;
};

const ToneSelect = ({ part, t, k, opts }: { part: number; t: 0 | 1; k: string; opts?: { value: string; label: string; group?: string }[] }) => {
  const d = TP[k];
  const v = useApp((s) => getIn(s.current.parts[part].patch.tones[t], k.split('.')) as string);
  return <Select value={v} options={opts ?? d.options!.map((o) => ({ value: o, label: o.toUpperCase() }))} onChange={(x) => editPath(['parts', part, 'patch', 'tones', t, ...k.split('.')], x)} info={paramInfo(d)} />;
};

/** Envelope graph: times on x (log-ish), levels on y. */
export const EnvGraph = ({ times, levels, bipolar, w = 150, h = 46 }: { times: number[]; levels: number[]; bipolar?: boolean; w?: number; h?: number }) => {
  const secs = times.map((t) => Math.pow(envTime(t), 0.5));
  const sus = 0.35;
  const total = secs[0] + secs[1] + secs[2] + sus + secs[3] || 1;
  const sx = (w - 4) / total;
  const y = (l: number) => (bipolar ? h / 2 - (l / 63) * (h / 2 - 3) : h - 3 - (l / 127) * (h - 6));
  let x = 2;
  const pts: [number, number][] = [[x, y(levels[0])]];
  x += secs[0] * sx; pts.push([x, y(levels[1])]);
  x += secs[1] * sx; pts.push([x, y(levels[2])]);
  x += secs[2] * sx; pts.push([x, y(levels[3])]);
  x += sus * sx; pts.push([x, y(levels[3])]);
  x += secs[3] * sx; pts.push([x, y(levels[4])]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const base = bipolar ? h / 2 : h - 3;
  return (
    <svg className="envgraph" width={w} height={h} data-info="Envelope|Shape of the envelope: three stages after note on, sustain, then release.">
      <line className="ax" x1="0" x2={w} y1={base} y2={base} />
      <path className="fillp" d={`${d}L${pts[pts.length - 1][0]} ${base}L2 ${base}Z`} />
      <path d={d} />
    </svg>
  );
};

const modEnvArrays = (e: ModEnv) => [[e.t1, e.t2, e.t3, e.t4], [e.l0, e.l1, e.l2, e.l3, e.l4]];
const ampEnvArrays = (e: AmpEnv) => [[e.t1, e.t2, e.t3, e.t4], [0, e.l1, e.l2, e.l3, 0]];

const LfoSection = ({ part, t, n }: { part: number; t: 0 | 1; n: 1 | 2 }) => {
  const k = `lfo${n}`;
  const sync = useApp((s) => s.current.parts[part].patch.tones[t][k as 'lfo1'].sync);
  return (
    <Section title={`LFO ${n}`} info={`LFO ${n}|Low frequency oscillator for vibrato, wah, tremolo and auto-pan.`}>
      <div className="col gap4">
        <div className="row gap4">
          <ToneSelect part={part} t={t} k={`${k}.wave`} />
          <ToneSelect part={part} t={t} k={`${k}.sync`} opts={SYNC_VALUES.map((v) => ({ value: v, label: v === 'off' ? 'FREE' : v }))} />
          <ToneToggle part={part} t={t} k={`${k}.keySync`} label="KEY SYNC" />
        </div>
        <div className="row wrap" style={{ gap: 0 }}>
          {sync === 'off' && <ToneKnob part={part} t={t} k={`${k}.rate`} />}
          <ToneKnob part={part} t={t} k={`${k}.delay`} />
          <ToneKnob part={part} t={t} k={`${k}.fade`} />
          <ToneKnob part={part} t={t} k={`${k}.pitch`} label="PITCH" />
          <ToneKnob part={part} t={t} k={`${k}.filter`} label="FILTER" />
          <ToneKnob part={part} t={t} k={`${k}.amp`} label="AMP" />
          <ToneKnob part={part} t={t} k={`${k}.pan`} label="PAN" />
        </div>
      </div>
    </Section>
  );
};

const waveOpts = WAVES.map((w) => ({ value: w.id, label: w.name, group: w.group }));

const ToneColumn = ({ part, t }: { part: number; t: 0 | 1 }) => {
  const tone = useApp((s) => s.current.parts[part].patch.tones[t]) as Tone;
  const structure = useApp((s) => s.current.parts[part].patch.structure);
  const used = structure === 'mix' ? tone.on : true;
  const [pt, pl] = modEnvArrays(tone.penv);
  const [ft, fl] = modEnvArrays(tone.fenv);
  const [at, al] = ampEnvArrays(tone.aenv);
  return (
    <div className="col gap8" style={{ opacity: used ? 1 : 0.55, minWidth: 0 }}>
      <Section
        title={`TONE ${t + 1}${structure !== 'mix' && t === 1 ? ` (${structure.toUpperCase()} SOURCE)` : ''}`}
        info={`Tone ${t + 1}|One of the patch's two tones: oscillator, pitch envelope, filter, amp and two LFOs.`}
        right={<ToneToggle part={part} t={t} k="on" label={tone.on ? 'ON' : 'OFF'} />}
      >
        <div className="col gap4">
          <div className="row gap4">
            <ToneSelect part={part} t={t} k="wave" opts={waveOpts} />
            <span className="dim" style={{ whiteSpace: 'normal' }}>{waveDef(tone.wave).help}</span>
          </div>
          <div className="row wrap" style={{ gap: 0 }}>
            <ToneKnob part={part} t={t} k="waveParam" label="WAVE PRM" />
            <ToneKnob part={part} t={t} k="coarse" />
            <ToneKnob part={part} t={t} k="fine" />
            <ToneKnob part={part} t={t} k="randomPitch" label="RANDOM" />
            <ToneKnob part={part} t={t} k="pitchKeyFollow" label="KEY FLW" bipolar={false} />
            <ToneKnob part={part} t={t} k="drive" />
            <ToneKnob part={part} t={t} k="level" label="LEVEL" />
            <ToneKnob part={part} t={t} k="pan" label="PAN" />
            <ToneKnob part={part} t={t} k="velSens" label="VELO" />
          </div>
        </div>
      </Section>
      <Section title="PITCH ENVELOPE" info="Pitch envelope|Bends the pitch over time: drops for kicks and zaps, rises for risers.">
        <div className="row wrap" style={{ gap: 0, alignItems: 'center' }}>
          <EnvGraph times={pt} levels={pl} bipolar />
          <ToneKnob part={part} t={t} k="penvDepth" label="DEPTH" />
          <ToneKnob part={part} t={t} k="penvVelSens" label="VELO" />
          {['t1', 't2', 't3', 't4'].map((x) => <ToneKnob key={x} part={part} t={t} k={`penv.${x}`} />)}
          {['l0', 'l1', 'l2', 'l3', 'l4'].map((x) => <ToneKnob key={x} part={part} t={t} k={`penv.${x}`} />)}
        </div>
      </Section>
      <Section title="FILTER (TVF)" info="Filter|Shapes the brightness. Cutoff and resonance are the classic acid controls." right={<ToneSelect part={part} t={t} k="filterType" opts={['off', 'lpf', 'lpf24', 'bpf', 'hpf', 'pkg'].map((v) => ({ value: v, label: v === 'lpf24' ? 'LPF 24' : v.toUpperCase() }))} />}>
        <div className="row wrap" style={{ gap: 0, alignItems: 'center' }}>
          <ToneKnob part={part} t={t} k="cutoff" />
          <ToneKnob part={part} t={t} k="resonance" label="RESO" />
          <ToneKnob part={part} t={t} k="cutoffKeyFollow" label="KEY FLW" bipolar={false} />
          <ToneKnob part={part} t={t} k="fenvDepth" label="ENV DPTH" />
          <ToneKnob part={part} t={t} k="fenvVelSens" label="ENV VELO" />
          <EnvGraph times={ft} levels={fl} />
          {['t1', 't2', 't3', 't4'].map((x) => <ToneKnob key={x} part={part} t={t} k={`fenv.${x}`} />)}
          {['l0', 'l1', 'l2', 'l3', 'l4'].map((x) => <ToneKnob key={x} part={part} t={t} k={`fenv.${x}`} />)}
        </div>
      </Section>
      <Section title="AMP (TVA)" info="Amp envelope|Volume over time.">
        <div className="row wrap" style={{ gap: 0, alignItems: 'center' }}>
          <EnvGraph times={at} levels={al} />
          {['t1', 't2', 't3', 't4'].map((x) => <ToneKnob key={x} part={part} t={t} k={`aenv.${x}`} />)}
          {['l1', 'l2', 'l3'].map((x) => <ToneKnob key={x} part={part} t={t} k={`aenv.${x}`} />)}
        </div>
      </Section>
      <LfoSection part={part} t={t} n={1} />
      <LfoSection part={part} t={t} n={2} />
    </div>
  );
};

const PatchKnob = ({ part, k, label }: { part: number; k: keyof Patch; label?: string }) => {
  const d = PP[k as string];
  const v = useApp((s) => s.current.parts[part].patch[k] as number);
  return <Knob label={label ?? d.label} value={v} min={d.min} max={d.max} bipolar={d.min < 0} def={d.min < 0 ? 0 : undefined} onChange={(x) => editPath(['parts', part, 'patch', k], x)} info={paramInfo(d)} />;
};
const PatchToggle = ({ part, k, label }: { part: number; k: keyof Patch; label: string }) => {
  const v = useApp((s) => s.current.parts[part].patch[k] as boolean);
  return <Btn on={v} onClick={() => editPath(['parts', part, 'patch', k], !v)} info={paramInfo(PP[k as string])}>{label}</Btn>;
};

export const PatchView = () => {
  const part = useApp((s) => s.part);
  const patch = useApp((s) => s.current.parts[s.part].patch);
  const ref = useApp((s) => s.current.parts[s.part].patchRef);
  if (part === 0)
    return (
      <div className="empty">
        Part R is the rhythm part; it plays a rhythm set rather than a patch.
        <div style={{ marginTop: 8 }}><Btn onClick={() => setState({ view: 'rhythm' })}>EDIT RHYTHM SET</Btn> <Btn onClick={() => setState({ part: 1 })}>SELECT PART 1</Btn></div>
      </div>
    );
  return (
    <div className="col gap8">
      <Section title={`PATCH · PART ${partName(part)}`} info="Patch|Two-tone synth patch for this part. Changes are kept with the pattern; WRITE stores the patch in your user bank for reuse.">
        <div className="row wrap gap8" style={{ alignItems: 'center' }}>
          <TextInput value={patch.name} onChange={(v) => editPath(['parts', part, 'patch', 'name'], v.toUpperCase().slice(0, 16))} style={{ width: 140 }} info="Patch name|Up to 16 characters." />
          <Select value={patch.category} options={[...new Set([...patchCategories(), 'USER', patch.category])].map((c) => ({ value: c, label: c }))} onChange={(v) => editPath(['parts', part, 'patch', 'category'], v)} info="Category|Group used by the browser." />
          <span className="dim">from {ref}</span>
          <span className="grow" />
          <Btn onClick={() => writeUserPatch(patch)} info="Write|Saves this patch to the user patch bank.">WRITE TO USER</Btn>
          <Btn onClick={() => edit((p) => setIn(p, ['parts', part, 'patch', 'tones', 1], clone(p.parts[part].patch.tones[0])))} info="Copy tone|Copies tone 1 settings over tone 2.">TONE 1 → 2</Btn>
          <Btn onClick={() => setPatch(part, defaultPatch(), 'INIT')} info="Initialise|Replaces the patch with a plain saw.">INIT</Btn>
        </div>
        <div className="row wrap" style={{ gap: 0, marginTop: 6, alignItems: 'center' }}>
          <Select value={patch.structure} options={PP.structure.options!.map((o) => ({ value: o as Patch['structure'], label: `STRUCT: ${o.toUpperCase()}` }))} onChange={(v) => editPath(['parts', part, 'patch', 'structure'], v)} info={paramInfo(PP.structure)} />
          <PatchKnob part={part} k="structureDepth" label="DEPTH" />
          <PatchKnob part={part} k="level" label="LEVEL" />
          <PatchKnob part={part} k="pan" label="PAN" />
          <PatchKnob part={part} k="octave" label="OCTAVE" />
          <PatchKnob part={part} k="bendRange" label="BEND" />
          <PatchKnob part={part} k="analogFeel" label="ANALOG" />
          <div className="sep" />
          <div className="col gap4">
            <div className="row gap4">
              <PatchToggle part={part} k="mono" label="MONO" />
              <PatchToggle part={part} k="legato" label="LEGATO" />
              <PatchToggle part={part} k="portamento" label="PORTA" />
            </div>
          </div>
          <PatchKnob part={part} k="portaTime" label="PORTA T" />
        </div>
      </Section>
      <div className="grid2">
        <ToneColumn part={part} t={0} />
        <ToneColumn part={part} t={1} />
      </div>
    </div>
  );
};
