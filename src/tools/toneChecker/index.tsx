import { useRef, useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { captureImageForUpload, findImageInClipboard } from '../../lib/imageCapture';
import { makeLabelGetter } from '../../lib/parseLabeledOutput';
import { StructuredResult } from '../../components/StructuredResult';
import type { StructuredField } from '../../components/StructuredResult';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function parseResult(output: string) {
  const get = makeLabelGetter(output);

  return {
    tone: get('Tone:'),
    landsAs: get('Likely to land as:'),
    suggestion: get('Suggestion:'),
  };
}

function ToneChecker() {
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { output, loading, error, run } = useAiTool(meta.id);
  const { loading: extracting, run: runExtraction } = useAiTool('screenshot-to-text');

  async function handleImage(file: File) {
    setImageError(null);
    try {
      const { base64, mediaType } = await captureImageForUpload(file);
      const text = await runExtraction(JSON.stringify({ imageBase64: base64, mediaType }));
      if (text) {
        setMessage(text);
      } else {
        setImageError("Couldn't read that screenshot. Please try again, or type the message instead.");
      }
    } catch {
      setImageError("Couldn't read that screenshot. Please try again, or type the message instead.");
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFile = findImageInClipboard(event.clipboardData);
    if (!imageFile) return;
    event.preventDefault();
    void handleImage(imageFile);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleImage(file);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    run(JSON.stringify({ message: message.trim(), context: context.trim() }));
  }

  const parsed = output ? parseResult(output) : null;
  const fields = [
    parsed?.tone && ({ label: 'Tone', value: parsed.tone } as StructuredField),
    parsed?.landsAs && ({ label: 'Likely to land as', value: parsed.landsAs } as StructuredField),
    parsed?.suggestion && ({ label: 'Suggestion', value: parsed.suggestion } as StructuredField),
  ].filter((field): field is StructuredField => Boolean(field));
  const busy = loading || extracting;

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste a message you're about to send — an email, a text, a Slack reply — and get a quick
        read on how it might come across. You can also paste (Ctrl/Cmd+V) or upload a screenshot
        of the conversation instead of typing it out.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onPaste={handlePaste}
          placeholder="Paste your message here, or paste/upload a screenshot…"
          rows={6}
          disabled={busy}
        />

        <div className="tool-form-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            📷 Upload a screenshot
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
          />
          {extracting && <span className="tool-field-hint">Reading screenshot…</span>}
        </div>

        {imageError && <p className="tool-error">{imageError}</p>}

        <label className="tool-field">
          <span>
            Context <span className="tool-field-hint">(optional — only if it helps)</span>
          </span>
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="e.g. who this is going to, or anything about the situation that's relevant"
            rows={2}
            disabled={busy}
          />
        </label>

        <button type="submit" disabled={busy || !message.trim()}>
          {loading ? 'Checking…' : 'Check tone'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      <StructuredResult fields={fields} rawOutput={output} />
    </div>
  );
}

export const toneCheckerTool: ToolDefinition = {
  meta,
  Component: ToneChecker,
};
