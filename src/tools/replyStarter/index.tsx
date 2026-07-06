import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

type Tone = 'formal' | 'neutral' | 'friendly';
type Verbosity = 'short' | 'medium' | 'long';

interface ReplyStarterPayload {
  message: string;
  tone: Tone;
  verbosity: Verbosity;
  intent: string;
}

function parseReplies(output: string): string[] {
  return output
    .split(/\n(?=\d+[.)]\s)/)
    .map((chunk) => chunk.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function ReplyStarter() {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('neutral');
  const [verbosity, setVerbosity] = useState<Verbosity>('medium');
  const [intent, setIntent] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;

    const payload: ReplyStarterPayload = {
      message: message.trim(),
      tone,
      verbosity,
      intent: intent.trim(),
    };
    run(JSON.stringify(payload));
  }

  async function handleCopy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex((current) => (current === index ? null : current));
      }, 1500);
    } catch {
      // Clipboard access unavailable — the draft is still visible to copy by hand.
    }
  }

  const replies = output ? parseReplies(output) : [];

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste the message you owe a reply to. You'll get a few short, low-effort drafts you
        can send as-is or tweak.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Paste the message you need to reply to…"
          rows={6}
          disabled={loading}
        />

        <div className="tool-form-row">
          <label className="tool-field">
            <span>Tone</span>
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value as Tone)}
              disabled={loading}
            >
              <option value="formal">Formal — business communication</option>
              <option value="neutral">Neutral — someone you know</option>
              <option value="friendly">Friendly — a close friend</option>
            </select>
          </label>

          <label className="tool-field">
            <span>Length</span>
            <select
              value={verbosity}
              onChange={(event) => setVerbosity(event.target.value as Verbosity)}
              disabled={loading}
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>
        </div>

        <label className="tool-field">
          <span>Intent (optional)</span>
          <input
            type="text"
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="A few words on what you want the reply to say, e.g. politely decline"
            disabled={loading}
          />
        </label>

        <button type="submit" disabled={loading || !message.trim()}>
          {loading ? 'Drafting…' : 'Get reply drafts'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {replies.length > 0 && (
        <ul className="reply-list">
          {replies.map((reply, index) => (
            <li key={index} className="reply-item">
              <p>{reply}</p>
              <button type="button" className="copy-button" onClick={() => handleCopy(reply, index)}>
                {copiedIndex === index ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const replyStarterTool: ToolDefinition = {
  meta,
  Component: ReplyStarter,
};
