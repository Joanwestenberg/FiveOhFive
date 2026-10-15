import { useEffect, useRef, useState } from 'react';
import { Btn, Select } from './widgets/widgets';
import { Icon } from './icons';
import { useAgent, sendToAgent, stopAgent, setApiKey, setModel, setEffort, resetChat, undoAgent, MODELS, type Effort } from '../agent/agent';
import { setState } from '../store/store';

const SUGGESTIONS = [
  'Make a new 4-bar acid house track at 126 BPM',
  'Make the bassline squelchier with more resonance and slides',
  'Add a dub chord stab on part 4 with lots of delay',
  'Write a jungle break with a rolling reese bass',
  'Give the drums a lazy hip-hop swing',
  'Design a warm detuned pad and add slow chords on part 5',
];

export const Assistant = () => {
  const a = useAgent();
  const [text, setText] = useState('');
  const [showSettings, setShowSettings] = useState(!a.apiKey);
  const [keyDraft, setKeyDraft] = useState(a.apiKey);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [a.items, a.streaming]);
  const send = (t = text) => {
    if (!t.trim()) return;
    void sendToAgent(t);
    setText('');
  };
  return (
    <aside className="assistant" style={{ boxShadow: 'var(--shadow)', zIndex: 2 }}>
      <div className="tabs" style={{ alignItems: 'center', gap: 4, padding: '0 6px' }}>
        <span className="heading" style={{ flex: 1 }}>{Icon.spark} ASSISTANT</span>
        <Btn className="icon ghost" onClick={() => setShowSettings(!showSettings)} info="Settings|API key and model.">⚙</Btn>
        <Btn className="icon ghost" onClick={resetChat} info="New chat|Clears the conversation.">{Icon.plus}</Btn>
        <Btn className="icon ghost" onClick={() => setState({ assistantOpen: false })} info="Close|Hides the assistant.">{Icon.x}</Btn>
      </div>
      {showSettings && (
        <div className="col gap4" style={{ padding: 8, borderBottom: '1px solid var(--line)', background: 'var(--panel2)' }}>
          <span className="label">ANTHROPIC API KEY</span>
          <div className="row gap4">
            <input
              className="input grow"
              type="password"
              value={keyDraft}
              placeholder="sk-ant-…"
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { setApiKey(keyDraft); setShowSettings(false); } }}
              data-info="API key|Your own Anthropic API key. It is stored only in this browser and sent only to api.anthropic.com."
            />
            <Btn on={!!keyDraft && keyDraft === a.apiKey} onClick={() => { setApiKey(keyDraft); setShowSettings(false); }}>SAVE</Btn>
          </div>
          <div className="dim" style={{ whiteSpace: 'normal' }}>Stored in this browser only and sent directly to api.anthropic.com. Usage is billed to your account. Get a key at console.anthropic.com.</div>
          <div className="row gap4">
            <span className="label">MODEL</span>
            <Select value={a.model} options={MODELS.map((m) => ({ value: m.id, label: m.label }))} onChange={setModel} info="Model|Which Claude model runs the assistant." />
            <span className="label">EFFORT</span>
            <Select<Effort> value={a.effort} options={(['low', 'medium', 'high', 'xhigh', 'max'] as Effort[]).map((e) => ({ value: e, label: e.toUpperCase() }))} onChange={setEffort} info="Effort|Higher effort thinks longer and writes more carefully; lower is faster and cheaper." />
          </div>
        </div>
      )}
      <div className="chat" ref={chatRef}>
        {!a.items.length && (
          <div className="col gap8">
            <div className="dim" style={{ whiteSpace: 'normal' }}>Ask for a groove, a bassline or a sound and the assistant will program it into the current session. Every change can be undone.</div>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="btn" style={{ justifyContent: 'flex-start', height: 'auto', minHeight: 22, padding: '3px 7px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => send(s)} disabled={a.busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {a.items.map((it, i) =>
          it.kind === 'user' ? <div key={i} className="msg-u">{it.text}</div>
          : it.kind === 'assistant' ? <div key={i} className="msg-a">{it.text}</div>
          : it.kind === 'tool' ? <div key={i} className={`msg-tool${it.error ? ' err' : ''}`}>{it.text}</div>
          : it.kind === 'error' ? <div key={i} className="msg-err">{it.text}</div>
          : <div key={i} className="dim">{it.text}</div>,
        )}
        {a.streaming && <div className="msg-a">{a.streaming}</div>}
        {a.busy && !a.streaming && <div className="thinking">Working…</div>}
      </div>
      {a.checkpoint !== null && !a.busy && a.items.some((x) => x.kind === 'tool') && (
        <div style={{ padding: '0 8px 6px' }}>
          <Btn onClick={undoAgent} info="Undo assistant changes|Reverts the pattern edits from the assistant's last reply.">{Icon.undo} UNDO ASSISTANT CHANGES</Btn>
        </div>
      )}
      <div className="col gap4" style={{ padding: 8, borderTop: '1px solid var(--line)' }}>
        <textarea
          className="input"
          rows={3}
          value={text}
          placeholder={a.apiKey ? 'Describe a groove or a sound…' : 'Add your API key in settings (⚙) to start'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          data-info="Message|Enter sends, Shift+Enter adds a line."
        />
        <div className="row gap4">
          <span className="dim grow">{MODELS.find((m) => m.id === a.model)?.label} · {a.effort}</span>
          {a.busy ? (
            <Btn on onClick={stopAgent} info="Stop|Stops the assistant.">{Icon.stop} STOP</Btn>
          ) : (
            <Btn on={!!text.trim()} onClick={() => send()} info="Send|Sends your message.">{Icon.send} SEND</Btn>
          )}
        </div>
      </div>
    </aside>
  );
};
