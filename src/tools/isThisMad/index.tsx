import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function parseResult(output: string) {
  const lines = output.split('\n').map((line) => line.trim());
  const get = (label: string) =>
    lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();

  return {
    tone: get('Tone:'),
    meaning: get('Most likely meaning:'),
    reassurance: get('Reassurance:'),
  };
}

function IsThisMad() {
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    run(JSON.stringify({ message: message.trim(), context: context.trim() }));
  }

  const parsed = output ? parseResult(output) : null;
  const hasStructuredResult = parsed && (parsed.tone || parsed.meaning || parsed.reassurance);

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste a message someone else sent you and get a calm, literal read on it — instead
        of whatever worst-case story your brain is already writing.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Paste the message you received here…"
          rows={6}
          disabled={loading}
        />

        <label className="tool-field">
          <span>
            Context <span className="tool-field-hint">(optional — only if it helps)</span>
          </span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="e.g. who sent it, or anything about the situation that's relevant"
            rows={2}
            disabled={loading}
          />
        </label>

        <button type="submit" disabled={loading || !message.trim()}>
          {loading ? 'Reading…' : 'Get a calm read'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {hasStructuredResult && (
        <dl className="tool-result-fields">
          {parsed?.tone && (
            <>
              <dt>Tone</dt>
              <dd>{parsed.tone}</dd>
            </>
          )}
          {parsed?.meaning && (
            <>
              <dt>Most likely meaning</dt>
              <dd>{parsed.meaning}</dd>
            </>
          )}
          {parsed?.reassurance && (
            <>
              <dt>Reassurance</dt>
              <dd>{parsed.reassurance}</dd>
            </>
          )}
        </dl>
      )}
      {output && !hasStructuredResult && <p className="tool-result-plain">{output}</p>}
    </div>
  );
}

export const isThisMadTool: ToolDefinition = {
  meta,
  Component: IsThisMad,
};
