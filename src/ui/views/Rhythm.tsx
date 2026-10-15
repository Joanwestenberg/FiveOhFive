import { useState } from 'react';
import { Btn, NumBox, Section, Select, TextInput } from '../widgets/widgets';
import { useApp, setDrum, edit, noteOn, writeUserKit, setState } from '../../store/store';
import { DRUM_PARAMS, paramInfo } from '../../model/params';
import { defaultDrum } from '../../model/defaults';
import { DRUM_NOTE_NAMES } from '../../presets/kits';
import { WAVES } from '../../engine/dsp/waves';
import type { DrumInst } from '../../model/types';
import { Icon } from '../icons';

const DP = Object.fromEntries(DRUM_PARAMS.map((d) => [d.key, d]));
const NUM_COLS: (keyof DrumInst)[] = ['tune', 'decay', 'tone', 'snap', 'drive', 'level', 'pan', 'rev', 'dly', 'choke', 'velSens'];

export const RhythmView = () => {
  const kit = useApp((s) => s.current.kit);
  const kitRef = useApp((s) => s.current.kitRef);
  const level = useApp((s) => s.current.parts[0].level);
  const [selNote, setSelNote] = useState<number | null>(null);
  const [addNote, setAddNote] = useState(60);
  const insts = [...kit.insts].sort((a, b) => a.note - b.note);
  const free = Array.from({ length: 128 }, (_, i) => i).filter((n) => !kit.insts.some((d) => d.note === n));
  return (
    <div className="col gap8">
      <Section title="RHYTHM SET · PART R" info="Rhythm set|The drum kit played by the rhythm part. Every instrument is synthesised from a model with four macro controls.">
        <div className="row gap8 wrap">
          <TextInput value={kit.name} onChange={(v) => edit((p) => ({ ...p, kit: { ...p.kit, name: v.toUpperCase().slice(0, 16) } }))} style={{ width: 140 }} info="Kit name|Up to 16 characters." />
          <span className="dim">from {kitRef || '—'} · {kit.insts.length} instruments · part level {level}</span>
          <span className="grow" />
          <Select value={free.includes(addNote) ? addNote : free.find((n) => n >= 36) ?? free[0] ?? 0} options={free.map((n) => ({ value: n, label: `${n} ${DRUM_NOTE_NAMES[n] ?? ''}` }))} onChange={setAddNote} info="New instrument key|Which key the new instrument goes on." />
          <Btn onClick={() => {
            const n = free.includes(addNote) ? addNote : free.find((x) => x >= 36) ?? free[0];
            if (n === undefined) return;
            edit((p) => ({ ...p, kit: { ...p.kit, insts: [...p.kit.insts, defaultDrum(n, DRUM_NOTE_NAMES[n] ?? `NOTE ${n}`, 'tone')] } }));
            setSelNote(n);
          }} info="Add instrument|Adds an instrument on the chosen key.">{Icon.plus} ADD</Btn>
          <Btn onClick={() => writeUserKit(kit)} info="Write|Saves this rhythm set to your user kit bank.">WRITE TO USER</Btn>
          <Btn onClick={() => setState({ browserTab: 'kits' })} info="Load kit|Shows the kit browser on the left.">LOAD…</Btn>
        </div>
      </Section>
      <div style={{ overflow: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>KEY</th>
              <th>NAME</th>
              <th>MODEL</th>
              {NUM_COLS.map((c) => <th key={c}>{DP[c].label}</th>)}
              <th>WAVE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {insts.map((d) => (
              <tr key={d.note} className={selNote === d.note ? 'on' : ''} onClick={() => setSelNote(d.note)}>
                <td><Btn className="icon" onPointerDown={(e) => { e.stopPropagation(); noteOn(0, d.note, 110); }} info="Audition|Plays this instrument.">{Icon.play}</Btn></td>
                <td className="num">{d.note}</td>
                <td><TextInput value={d.name} onChange={(v) => setDrum(d.note, { name: v.toUpperCase().slice(0, 12) })} style={{ width: 92, height: 18 }} /></td>
                <td>
                  <Select value={d.model} options={DP.model.options!.map((m) => ({ value: m as DrumInst['model'], label: m.toUpperCase() }))} onChange={(model) => setDrum(d.note, { model })} info={paramInfo(DP.model)} />
                </td>
                {NUM_COLS.map((c) => (
                  <td key={c}>
                    <NumBox value={d[c] as number} min={DP[c].min} max={DP[c].max} width={40} onChange={(v) => { setDrum(d.note, { [c]: v } as Partial<DrumInst>); }} info={paramInfo(DP[c])} />
                  </td>
                ))}
                <td>{d.model === 'tone' ? <Select value={d.wave ?? 'sine'} options={WAVES.map((w) => ({ value: w.id, label: w.name }))} onChange={(wave) => setDrum(d.note, { wave })} info={paramInfo(DP.wave)} /> : <span className="faint">—</span>}</td>
                <td><Btn className="icon ghost" onClick={(e) => { e.stopPropagation(); edit((p) => ({ ...p, kit: { ...p.kit, insts: p.kit.insts.filter((x) => x.note !== d.note) } })); }} info="Remove|Deletes this instrument from the kit.">{Icon.x}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dim">Tip: drag a number up or down to tweak while the pattern plays. KICK: TONE = pitch sweep, SNAP = click. SNARE: SNAP = snappy noise. HAT: TONE = brightness, SNAP = noise mix. Hats in the same CHOKE group cut each other off.</div>
    </div>
  );
};
