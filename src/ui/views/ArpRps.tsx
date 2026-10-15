import { Btn, Knob, Section, Select, Seg } from '../widgets/widgets';
import { useApp, useTransport, setArp, setRps, allPatternIds, getPattern, rpsPad, setState } from '../../store/store';
import { ARP_STYLES, BEAT_PATTERNS } from '../../presets/arp';
import { partName } from '../../model/defaults';
import type { ArpRate, RpsSet } from '../../model/types';

const RATES: ArpRate[] = ['1/4', '1/6', '1/8', '1/12', '1/16', '1/24', '1/32'];

export const ArpRpsView = () => {
  const arp = useApp((s) => s.project.arp);
  const part = useApp((s) => s.part);
  const rps = useApp((s) => s.project.rps);
  const active = useTransport((t) => t.rpsActive);
  const held = useTransport((t) => t.heldArp);
  const ids = allPatternIds();
  const setSlot = (i: number, slot: RpsSet['slots'][number]) => setRps({ slots: rps.slots.map((s, k) => (k === i ? slot : s)) });
  return (
    <div className="col gap8">
      <Section title={`ARPEGGIATOR · PART ${partName(part)}`} info="Arpeggiator|Applies to the selected part. Hold notes on the keyboard, pads or MIDI; with HOLD on they keep playing.">
        <div className="col gap8">
          <div className="row gap8 wrap">
            <Btn on={arp.on} onClick={() => setArp({ on: !arp.on })} disabled={part === 0} info="Arpeggio|Turns the arpeggiator on for the selected part.">ARPEGGIO {arp.on ? 'ON' : 'OFF'}</Btn>
            <Btn on={arp.hold} onClick={() => setArp({ hold: !arp.hold })} info="Hold|Latches the notes you play.">HOLD</Btn>
            <Seg value={arp.rate} options={RATES.map((r) => ({ value: r, label: r }))} onChange={(rate) => setArp({ rate })} info="Rate|Step length." />
            <span className="dim">{held} notes held</span>
            {part === 0 && <span className="dim">Select a synth part (1-7) to arpeggiate.</span>}
          </div>
          <div className="row wrap gap4">
            {ARP_STYLES.map((s) => (
              <Btn key={s.id} on={arp.style === s.id} onClick={() => setArp({ style: s.id })} info={`${s.name}|${s.help}`}>{s.name}</Btn>
            ))}
          </div>
          <div className="row wrap gap4">
            <span className="label">BEAT</span>
            {BEAT_PATTERNS.map((b) => (
              <Btn key={b.id} on={arp.beat === b.id} onClick={() => setArp({ beat: b.id })} info={`${b.name}|${b.help}`}>{b.name}</Btn>
            ))}
          </div>
          <div className="row" style={{ gap: 0 }}>
            <Knob lg label="OCTAVES" value={arp.octaves} min={-3} max={3} def={1} onChange={(octaves) => setArp({ octaves })} info="Octave range|Octaves spanned; negative values go down." />
            <Knob lg label="GATE %" value={arp.gate} min={1} max={100} def={60} onChange={(gate) => setArp({ gate })} info="Gate|Note length relative to the step." />
            <Knob lg label="ACCENT" value={arp.accent} min={0} max={100} def={30} onChange={(accent) => setArp({ accent })} info="Accent|Dynamic difference between accented and normal steps." />
            <Knob lg label="SHUFFLE" value={arp.shuffle} min={0} max={100} def={0} onChange={(shuffle) => setArp({ shuffle })} info="Shuffle|Swing." />
            <Knob lg label="VELOCITY" value={arp.velocity} min={0} max={127} def={0} fmt={(v) => (v ? String(v) : 'REAL')} onChange={(velocity) => setArp({ velocity })} info="Velocity|0 uses the played velocity; otherwise a fixed velocity." />
          </div>
        </div>
      </Section>
      <Section
        title="RPS · REALTIME PHRASE SEQUENCE"
        info="RPS|Assign a part of any pattern to each pad, then hold pads in RPS pad mode to fire phrases in time over the playing pattern."
        right={
          <div className="row gap4">
            <span className="label">QUANTIZE</span>
            <Seg value={rps.quantize} options={[{ value: 'off', label: 'OFF' }, { value: '1/16', label: '1/16' }, { value: 'beat', label: 'BEAT' }, { value: 'measure', label: 'MEAS' }]} onChange={(quantize) => setRps({ quantize })} info="RPS quantize|When a phrase starts after you press its pad." />
            <Btn on={rps.hold} onClick={() => setRps({ hold: !rps.hold })} info="RPS hold|Phrases keep looping after release; press again to stop.">HOLD</Btn>
            <Btn onClick={() => setState({ view: 'perform', padMode: 'rps' })} info="Play RPS|Switch the pads to RPS mode.">PADS → RPS</Btn>
          </div>
        }
      >
        <table className="tbl">
          <thead><tr><th>PAD</th><th>PATTERN</th><th>SOURCE PART</th><th>PLAYS ON PART</th><th /></tr></thead>
          <tbody>
            {rps.slots.map((s, i) => (
              <tr key={i} className={active.includes(i) ? 'on' : ''}>
                <td className="num">{i + 1}</td>
                <td>
                  <Select value={s?.patternId ?? ''} options={[{ value: '', label: '— EMPTY —' }, ...ids.map((id) => ({ value: id, label: `${id} ${getPattern(id)?.name ?? ''}` }))]} onChange={(v) => setSlot(i, v ? { patternId: v, part: s?.part ?? 0, target: s?.target ?? s?.part ?? 0 } : null)} info="Phrase pattern|Pattern the phrase comes from." />
                </td>
                <td>
                  <Select value={s?.part ?? 0} disabled={!s} options={Array.from({ length: 8 }, (_, k) => ({ value: k, label: `PART ${partName(k)}` }))} onChange={(v) => s && setSlot(i, { ...s, part: v, target: v })} info="Source part|Which track of that pattern the phrase uses." />
                </td>
                <td>
                  <Select value={s?.target ?? 0} disabled={!s} options={Array.from({ length: 8 }, (_, k) => ({ value: k, label: `PART ${partName(k)}` }))} onChange={(v) => s && setSlot(i, { ...s, target: v })} info="Target part|Which part's sound plays the phrase." />
                </td>
                <td><Btn disabled={!s} onPointerDown={() => rpsPad(i, true)} onPointerUp={() => rpsPad(i, false)} info="Trigger|Hold to play this phrase.">PLAY</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
};
