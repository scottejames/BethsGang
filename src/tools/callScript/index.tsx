import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { makeLabelGetter } from '../../lib/parseLabeledOutput';
import { StructuredResult } from '../../components/StructuredResult';
import type { StructuredField } from '../../components/StructuredResult';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

type Tone = 'formal' | 'neutral' | 'friendly';

interface CallScriptPayload {
  message: string;
  tone: Tone;
  about: string;
}

function parseScript(output: string) {
  const get = makeLabelGetter(output);

  return {
    opening: get('Opening:'),
    mainPoint: get('Main point:'),
    ifTheyAsk: get('If they ask more:'),
    closing: get('Closing:'),
  };
}

function CallScript() {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('neutral');
  const [about, setAbout] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;

    const payload: CallScriptPayload = {
      message: message.trim(),
      tone,
      about: about.trim(),
    };
    run(JSON.stringify(payload));
  }

  const script = output ? parseScript(output) : null;
  const fields = [
    script?.opening && ({ label: 'Opening', value: script.opening } as StructuredField),
    script?.mainPoint && ({ label: 'Main point', value: script.mainPoint } as StructuredField),
    script?.ifTheyAsk && ({ label: 'If they ask more', value: script.ifTheyAsk } as StructuredField),
    script?.closing && ({ label: 'Closing', value: script.closing } as StructuredField),
  ].filter((field): field is StructuredField => Boolean(field));

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Describe what the call needs to accomplish. You'll get a short script covering
        the parts that are easy to freeze on — how to open it and how to close it — so
        you're only improvising the bit you actually called about.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. Reschedule my dentist appointment to next week"
          rows={4}
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
              <option value="formal">Formal — business</option>
              <option value="neutral">Neutral — someone you know</option>
              <option value="friendly">Friendly — a close friend</option>
            </select>
          </label>

          <label className="tool-field">
            <span>Who are you calling? (optional)</span>
            <input
              type="text"
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              placeholder="e.g. dentist's office, my landlord"
              disabled={loading}
            />
          </label>
        </div>

        <button type="submit" disabled={loading || !message.trim()}>
          {loading ? 'Writing script…' : 'Write my script'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      <StructuredResult fields={fields} rawOutput={output} className="call-script-fields" />
    </div>
  );
}

export const callScriptTool: ToolDefinition = {
  meta,
  Component: CallScript,
};
