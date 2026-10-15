// The bring-your-own-key assistant: a manual streaming tool-use loop against the Claude API,
// running entirely in the browser. The key never leaves this machine except to call the API.

import Anthropic from '@anthropic-ai/sdk';
import { useSyncExternalStore } from 'react';
import { API_TOOLS, TOOL_MAP, stateSnapshot } from './tools';
import { SYSTEM_PROMPT } from './prompt';
import { lsGet, lsSet } from '../store/persist';
import { undoDepth, undoTo, status, getState, loadPattern } from '../store/store';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', fallback: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', fallback: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', fallback: false },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', fallback: true },
] as const;
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ChatItem {
  kind: 'user' | 'assistant' | 'tool' | 'error' | 'info';
  text: string;
  error?: boolean;
}

interface AgentState {
  items: ChatItem[];
  busy: boolean;
  streaming: string;
  apiKey: string;
  model: string;
  effort: Effort;
  checkpoint: { depth: number; patternId: string } | null; // state before the last agent turn
}

let st: AgentState = {
  items: [],
  busy: false,
  streaming: '',
  apiKey: lsGet('apiKey', ''),
  model: lsGet('model', 'claude-opus-5-5'),
  effort: lsGet('effort', 'medium') as Effort,
  checkpoint: null,
};
const ls = new Set<() => void>();
const set = (p: Partial<AgentState>) => {
  st = { ...st, ...p };
  for (const l of ls) l();
};
export const useAgent = () => useSyncExternalStore((cb) => { ls.add(cb); return () => ls.delete(cb); }, () => st, () => st);
export const setApiKey = (k: string) => { lsSet('apiKey', k.trim()); set({ apiKey: k.trim() }); };
export const setModel = (m: string) => { lsSet('model', m); set({ model: m }); };
export const setEffort = (e: Effort) => { lsSet('effort', e); set({ effort: e }); };

const push = (it: ChatItem) => set({ items: [...st.items, it] });

let history: Anthropic.Beta.BetaMessageParam[] = [];
let abort: AbortController | null = null;

export const resetChat = () => {
  history = [];
  set({ items: [], streaming: '', checkpoint: null });
};

export const stopAgent = () => abort?.abort();

export const undoAgent = () => {
  if (st.checkpoint === null) return;
  const { depth, patternId } = st.checkpoint;
  if (getState().current.id !== patternId) loadPattern(patternId, { queue: false });
  else undoTo(depth);
  set({ checkpoint: null });
  push({ kind: 'info', text: 'Reverted the assistant’s pattern changes.' });
  status('Assistant changes undone.');
};

const summarize = (name: string, input: Record<string, unknown>) => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) parts.push(`${k}: ${v.length} items`);
    else if (v && typeof v === 'object') parts.push(`${k}: {${Object.keys(v).slice(0, 6).join(', ')}${Object.keys(v).length > 6 ? ', …' : ''}}`);
    else parts.push(`${k}: ${String(v).slice(0, 60)}`);
  }
  return `${name}(${parts.join(', ')})`;
};

export const sendToAgent = async (text: string) => {
  if (st.busy || !text.trim()) return;
  if (!st.apiKey) {
    push({ kind: 'error', text: 'Add your Anthropic API key in the assistant settings first.' });
    return;
  }
  const client = new Anthropic({ apiKey: st.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const model = MODELS.find((m) => m.id === st.model) ?? MODELS[0];
  push({ kind: 'user', text });
  set({ busy: true, streaming: '', checkpoint: { depth: undoDepth(), patternId: getState().current.id } });
  // The current state rides along with every user turn so the model rarely needs a get_state round trip.
  history.push({
    role: 'user',
    content: [{ type: 'text', text: `${text}\n\n<current_state>\n${JSON.stringify(stateSnapshot())}\n</current_state>` }],
  });
  abort = new AbortController();
  let jsonRetries = 0;
  try {
    for (let turn = 0; turn < 40; turn++) {
      const params: Anthropic.Beta.MessageCreateParamsStreaming = {
        model: model.id,
        max_tokens: 64000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: API_TOOLS,
        messages: history,
        thinking: { type: 'adaptive' },
        output_config: { effort: st.effort },
        cache_control: { type: 'ephemeral' },
        stream: true,
        ...(model.fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      };
      const stream = client.beta.messages.stream(params, { signal: abort.signal });
      let live = '';
      stream.on('text', (delta) => {
        live += delta;
        set({ streaming: live });
      });
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only an unparseable tool input is retried; API and abort errors propagate.
        if (err instanceof Anthropic.APIError || abort.signal.aborted || jsonRetries++ >= 2) throw err;
        set({ streaming: '' });
        continue;
      }
      set({ streaming: '' });
      const textOut = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
      if (textOut.trim()) push({ kind: 'assistant', text: textOut.trim() });

      if (message.stop_reason === 'refusal') {
        push({ kind: 'error', text: 'The model declined this request.' });
        history.push({ role: 'assistant', content: message.content });
        break;
      }
      const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (message.stop_reason === 'max_tokens' && uses.length) {
        // a truncated tool input may parse as a valid partial object; never run it
        push({ kind: 'error', text: 'The response hit the output limit before a tool call finished. Try a smaller request.' });
        break;
      }
      history.push({ role: 'assistant', content: message.content });
      if (message.stop_reason === 'pause_turn') continue;
      if (!uses.length) break;
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        const tool = TOOL_MAP[u.name];
        const input = (u.input && typeof u.input === 'object' ? u.input : {}) as Record<string, unknown>;
        try {
          if (!tool) throw new Error(`unknown tool ${u.name}`);
          const out = await tool.run(input);
          const json = JSON.stringify(out ?? { ok: true });
          push({ kind: 'tool', text: `▸ ${summarize(u.name, input)}` });
          results.push({ type: 'tool_result', tool_use_id: u.id, content: json.length > 60000 ? `${json.slice(0, 60000)}…(truncated)` : json });
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          push({ kind: 'tool', text: `▸ ${summarize(u.name, input)} → ${msg}`, error: true });
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: msg });
        }
      }
      history.push({ role: 'user', content: results });
    }
  } catch (err) {
    if (abort.signal.aborted) push({ kind: 'info', text: 'Stopped.' });
    else if (err instanceof Anthropic.AuthenticationError) push({ kind: 'error', text: 'The API key was rejected. Check it in the assistant settings.' });
    else if (err instanceof Anthropic.RateLimitError) push({ kind: 'error', text: 'Rate limited by the API. Wait a moment and try again.' });
    else if (err instanceof Anthropic.APIConnectionError) push({ kind: 'error', text: 'Could not reach the Claude API. Check your connection.' });
    else if (err instanceof Anthropic.APIError) push({ kind: 'error', text: `API error ${err.status ?? ''}: ${err.message}` });
    else push({ kind: 'error', text: String(err) });
    // keep history valid: drop a trailing assistant tool_use without results
    const last = history[history.length - 1];
    if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => (b as { type: string }).type === 'tool_use')) history.pop();
    if (history[history.length - 1]?.role === 'user' && history.length && typeof history[history.length - 1].content !== 'string') {
      const c = history[history.length - 1].content as { type: string }[];
      if (c.every((b) => b.type === 'text')) history.pop();
    }
  } finally {
    abort = null;
    set({ busy: false, streaming: '' });
  }
};
