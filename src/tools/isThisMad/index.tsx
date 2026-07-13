import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { getBulletList, makeLabelGetter } from '../../lib/parseLabeledOutput';
import { StructuredResult } from '../../components/StructuredResult';
import type { StructuredField } from '../../components/StructuredResult';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function parseResult(output: string) {
  const get = makeLabelGetter(output);

  return {
    tone: get('Tone:'),
    meaning: get('Most likely meaning:'),
    reassurance: get('Reassurance:'),
    asks: getBulletList(output, 'asks:'),
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
  const fields = [
    parsed?.tone && ({ label: 'Tone', value: parsed.tone } as StructuredField),
    parsed?.meaning && ({ label: 'Most likely meaning', value: parsed.meaning } as StructuredField),
    parsed?.reassurance && ({ label: 'Reassurance', value: parsed.reassurance } as StructuredField),
    parsed &&
      parsed.asks.length > 0 &&
      ({
        label: 'Asks',
        value: (
          <ul className="tool-result-fields-list">
            {parsed.asks.map((ask, index) => (
              <li key={index}>{ask}</li>
            ))}
          </ul>
        ),
      } as StructuredField),
  ].filter((field): field is StructuredField => Boolean(field));

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste a message someone else sent you and get a calm, literal read on it — the tone,
        and what they're actually asking for — instead of whatever worst-case story your
        brain is already writing.
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

      <StructuredResult fields={fields} rawOutput={output} />
    </div>
  );
}

export const isThisMadTool: ToolDefinition = {
  meta,
  Component: IsThisMad,
};
