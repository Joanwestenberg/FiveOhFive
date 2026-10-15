import { useState } from 'react';
import { Btn, NumBox, Section, Select, TextInput } from '../widgets/widgets';
import { useApp, setProject, allPatternIds, getPattern, playSong, stopSong, stop, getState } from '../../store/store';
import type { Song } from '../../model/types';
import { Icon } from '../icons';
import { patternTicks } from '../../model/defaults';

export const SongView = () => {
  const songs = useApp((s) => s.project.songs);
  const playing = useApp((s) => s.song);
  const [sel, setSel] = useState(songs[0]?.id ?? '');
  const song = songs.find((s) => s.id === sel) ?? songs[0];
  const ids = allPatternIds();
  const update = (patch: Partial<Song>) => setProject({ songs: getState().project.songs.map((s) => (s.id === song.id ? { ...s, ...patch } : s)) });
  if (!song) return <div className="empty">No songs. Create one from the SONGS tab in the browser.</div>;
  const secs = song.steps.reduce((a, st) => {
    const p = getPattern(st.patternId);
    return p ? a + ((patternTicks(p) / 96) * 60) / p.tempo * st.repeats : a;
  }, 0);
  return (
    <div className="col gap8">
      <Section title="SONG" info="Song|A chain of patterns, each repeated a number of times. Patterns switch seamlessly at their ends.">
        <div className="row gap8 wrap">
          <Select value={song.id} options={songs.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))} onChange={setSel} info="Song|Which song to edit." />
          <TextInput value={song.name} onChange={(v) => update({ name: v.toUpperCase().slice(0, 16) })} style={{ width: 140 }} info="Song name|Up to 16 characters." />
          <Btn on={song.loop} onClick={() => update({ loop: !song.loop })} info="Loop|Return to the first step after the last.">LOOP</Btn>
          <span className="dim">{song.steps.length} steps · {Math.floor(secs / 60)}:{String(Math.round(secs % 60)).padStart(2, '0')}</span>
          <span className="grow" />
          {playing?.id === song.id ? (
            <Btn on onClick={() => { stopSong(); stop(); }} info="Stop song|Stops song playback.">{Icon.stop} STOP SONG</Btn>
          ) : (
            <Btn onClick={() => playSong(song.id, 0)} disabled={!song.steps.length} info="Play song|Plays the song from the first step.">{Icon.play} PLAY SONG</Btn>
          )}
          <Btn onClick={() => setProject({ songs: getState().project.songs.filter((s) => s.id !== song.id) })} info="Delete song|Removes this song.">{Icon.trash}</Btn>
        </div>
      </Section>
      <table className="tbl">
        <thead><tr><th>STEP</th><th>PATTERN</th><th>REPEATS</th><th>TEMPO</th><th /></tr></thead>
        <tbody>
          {song.steps.map((st, i) => (
            <tr key={i} className={playing?.id === song.id && playing.step === i ? 'on' : ''}>
              <td className="num">{i + 1}</td>
              <td><Select value={st.patternId} options={ids.map((id) => ({ value: id, label: `${id} ${getPattern(id)?.name ?? ''}` }))} onChange={(v) => update({ steps: song.steps.map((x, k) => (k === i ? { ...x, patternId: v } : x)) })} info="Pattern|Pattern played at this step." /></td>
              <td><NumBox value={st.repeats} min={1} max={64} width={40} onChange={(v) => update({ steps: song.steps.map((x, k) => (k === i ? { ...x, repeats: v } : x)) })} info="Repeats|How many times the pattern plays." /></td>
              <td className="num dim">{getPattern(st.patternId)?.tempo ?? '—'}</td>
              <td className="row gap2">
                <Btn className="icon" onClick={() => playSong(song.id, i)} info="Play from here|Starts the song at this step.">{Icon.play}</Btn>
                <Btn className="icon" disabled={i === 0} onClick={() => { const s = [...song.steps]; [s[i - 1], s[i]] = [s[i], s[i - 1]]; update({ steps: s }); }} info="Move up">↑</Btn>
                <Btn className="icon" disabled={i === song.steps.length - 1} onClick={() => { const s = [...song.steps]; [s[i + 1], s[i]] = [s[i], s[i + 1]]; update({ steps: s }); }} info="Move down">↓</Btn>
                <Btn className="icon" onClick={() => update({ steps: song.steps.filter((_, k) => k !== i) })} info="Remove step">{Icon.x}</Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap4">
        <Btn onClick={() => update({ steps: [...song.steps, { patternId: getState().current.id, repeats: 2 }] })} info="Add step|Appends the current pattern.">{Icon.plus} ADD CURRENT PATTERN</Btn>
      </div>
    </div>
  );
};
