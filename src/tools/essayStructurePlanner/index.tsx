import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { useTaskStore } from '../../context/TaskStoreContext';
import { useToolNavigation } from '../../context/ToolNavigationContext';
import { useOnceGuard } from '../../hooks/useOnceGuard';
import { parseNumberedList } from '../../lib/parseNumberedList';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface EssayStructurePayload {
  title: string;
  description: string;
  currentStructure?: string;
  feedback?: string;
}

function EssayStructurePlanner() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);
  const { addProject, addTask } = useTaskStore();
  const { navigateToTool } = useToolNavigation();
  // Same one-shot guard as Assignment Breakdown/Task Breakdown's — blocks a fast
  // double-click on "Send to Everything Pile" from creating duplicate projects. See
  // useOnceGuard.ts.
  const sentGuard = useOnceGuard();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;

    sentGuard.reset();
    const payload: EssayStructurePayload = { title: title.trim(), description: description.trim() };
    run(JSON.stringify(payload));
  }

  // A revision call — the current structure (this session's last output) plus the
  // student's feedback on it, not the full round-by-round history. The model only
  // needs "here's the structure, here's what to change about it" to produce the
  // next version; each revision becomes the new baseline for the round after it.
  function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!feedback.trim() || !output) return;

    const payload: EssayStructurePayload = {
      title: title.trim(),
      description: description.trim(),
      currentStructure: output,
      feedback: feedback.trim(),
    };
    run(JSON.stringify(payload)).then(() => setFeedback(''));
  }

  const headings = output ? parseNumberedList(output) : [];

  function handleSendToEverythingPile() {
    if (sentGuard.hasFired()) return;
    sentGuard.markFired();
    const project = addProject(title.trim());
    headings.forEach((heading) => {
      addTask({ title: heading, projectId: project.id, size: 'small', category: 'now' });
    });
    navigateToTool('everything-pile');
  }

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Give it an essay title and a short description of the assignment. It'll
        suggest a light-touch structure — meaningful section headings that build
        toward a conclusion, not a generic template or the essay itself. Give
        feedback to adjust it, or send it straight to Everything Pile as a project
        once you're happy with it.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="tool-field">
          <span>Essay title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. The Causes of WWI"
            disabled={loading}
          />
        </label>

        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short description of the assignment — what it's about, any requirements…"
          rows={4}
          disabled={loading}
        />

        <button type="submit" disabled={loading || !title.trim() || !description.trim()}>
          {loading ? 'Structuring…' : 'Suggest a structure'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {headings.length > 0 && (
        <>
          <ol className="tool-result-list">
            {headings.map((heading, index) => (
              <li key={index}>{heading}</li>
            ))}
          </ol>

          <form onSubmit={handleUpdate} className="tool-form">
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Want to adjust the structure? Say how, e.g. &quot;add a section on…&quot;"
              rows={3}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !feedback.trim()}>
              {loading ? 'Updating…' : 'Update structure with feedback'}
            </button>
          </form>

          <div className="tool-result-actions">
            <button type="button" onClick={handleSendToEverythingPile} disabled={loading}>
              Send "{title.trim()}" to Everything Pile
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const essayStructurePlannerTool: ToolDefinition = {
  meta,
  Component: EssayStructurePlanner,
};
