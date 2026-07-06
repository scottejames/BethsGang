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
    landsAs: get('Likely to land as:'),
    suggestion: get('Suggestion:'),
  };
}

function ToneChecker() {
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    run(JSON.stringify({ message: message.trim(), context: context.trim() }));
  }

  const parsed = output ? parseResult(output) : null;
  const hasStructuredResult = parsed && (parsed.tone || parsed.landsAs || parsed.suggestion);

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste a message you're about to send — an email, a text, a Slack reply — and get a quick
        read on how it might come across.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Paste your message here…"
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
            placeholder="e.g. who this is going to, or anything about the situation that's relevant"
            rows={2}
            disabled={loading}
          />
        </label>

        <button type="submit" disabled={loading || !message.trim()}>
          {loading ? 'Checking…' : 'Check tone'}
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
          {parsed?.landsAs && (
            <>
              <dt>Likely to land as</dt>
              <dd>{parsed.landsAs}</dd>
            </>
          )}
          {parsed?.suggestion && (
            <>
              <dt>Suggestion</dt>
              <dd>{parsed.suggestion}</dd>
            </>
          )}
        </dl>
      )}
      {output && !hasStructuredResult && <p className="tool-result-plain">{output}</p>}
    </div>
  );
}

export const toneCheckerTool: ToolDefinition = {
  meta,
  Component: ToneChecker,
};
