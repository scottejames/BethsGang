import { useEffect, useRef, useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { useTaskStore } from '../../context/TaskStoreContext';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface DraftTask {
  id: string;
  text: string;
  included: boolean;
}

function cleanStep(step: string): string {
  return step.replace(/^\d+\.\s*/, '');
}

// The Web Speech API has no dedicated entry in TypeScript's bundled DOM lib (only a
// handful of its supporting event types do) — this is a minimal local shape for just
// what's used below, not a claim about the real spec surface. Constructor lives at
// `webkitSpeechRecognition` in Chrome-family browsers, unprefixed in some others.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function BrainDumpSorter() {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [draftTasks, setDraftTasks] = useState<DraftTask[] | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const { output, loading, error, run } = useAiTool(meta.id);
  const { addTask } = useTaskStore();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechRecognitionSupported = Boolean(getSpeechRecognitionConstructor());

  // Stop any in-progress dictation if the tool unmounts (e.g. the user navigates away)
  // rather than leaving the microphone silently listening.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // A fresh result replaces whatever draft list and confirmation message were showing
  // from a previous brain dump, rather than the two piling up together.
  useEffect(() => {
    if (output === null) return;
    setSentMessage(null);
    if (output.trim().toUpperCase() === 'NONE') {
      setDraftTasks([]);
      return;
    }
    const parsed = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(cleanStep)
      .filter(Boolean)
      .map((taskText) => ({ id: crypto.randomUUID(), text: taskText, included: true }));
    setDraftTasks(parsed);
  }, [output]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim()) {
      run(text.trim());
    }
  }

  function handleToggleDictate() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setText((current) => (current ? `${current} ${transcript}`.trim() : transcript.trim()));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function updateDraft(id: string, patch: Partial<Pick<DraftTask, 'text' | 'included'>>) {
    setDraftTasks((current) => (current ? current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)) : current));
  }

  function handleSend() {
    if (!draftTasks) return;
    const toSend = draftTasks.filter((draft) => draft.included && draft.text.trim());
    toSend.forEach((draft) => {
      addTask({ title: draft.text.trim(), projectId: undefined, size: 'small', category: 'later' });
    });
    setSentMessage(`Sent ${toSend.length} task${toSend.length === 1 ? '' : 's'} to Everything Pile.`);
    setDraftTasks(null);
    setText('');
  }

  const includedCount = draftTasks?.filter((draft) => draft.included && draft.text.trim()).length ?? 0;

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Type or dictate whatever's rattling around in your head — a paragraph or two is
        fine, it doesn't need to make sense. You'll get back the actionable bits as a
        short list: pick the ones that fit, edit any that don't, and send them on to
        Everything Pile.
      </p>

      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What's on your mind?"
          rows={6}
          disabled={loading}
        />
        <div className="tool-form-row">
          {speechRecognitionSupported && (
            <button
              type="button"
              className={`secondary-button${listening ? ' brain-dump-dictate-active' : ''}`}
              onClick={handleToggleDictate}
              disabled={loading}
            >
              {listening ? '⏹ Stop dictating' : '🎙️ Dictate'}
            </button>
          )}
          <button type="submit" disabled={loading || !text.trim()}>
            {loading ? 'Sorting…' : 'Sort it out'}
          </button>
        </div>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {draftTasks !== null &&
        (draftTasks.length === 0 ? (
          <p className="task-empty">Nothing actionable found in that — try adding more detail.</p>
        ) : (
          <>
            <ul className="brain-dump-list">
              {draftTasks.map((draft) => (
                <li key={draft.id} className="brain-dump-item">
                  <input
                    type="checkbox"
                    checked={draft.included}
                    aria-label={`Include "${draft.text}"`}
                    onChange={(event) => updateDraft(draft.id, { included: event.target.checked })}
                  />
                  <input
                    type="text"
                    className="brain-dump-item-text"
                    value={draft.text}
                    aria-label="Edit task text"
                    onChange={(event) => updateDraft(draft.id, { text: event.target.value })}
                  />
                </li>
              ))}
            </ul>
            <div className="tool-result-actions">
              <button type="button" onClick={handleSend} disabled={includedCount === 0}>
                Send {includedCount} to Everything Pile
              </button>
            </div>
          </>
        ))}

      {sentMessage && <p className="brain-dump-sent">{sentMessage}</p>}
    </div>
  );
}

export const brainDumpSorterTool: ToolDefinition = {
  meta,
  Component: BrainDumpSorter,
};
