import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { useTaskStore } from '../../context/TaskStoreContext';
import { useToolNavigation } from '../../context/ToolNavigationContext';
import { useOnceGuard } from '../../hooks/useOnceGuard';
import { parseNumberedList } from '../../lib/parseNumberedList';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface AssignmentBreakdownPayload {
  assignmentName: string;
  instructions: string;
}

function AssignmentBreakdown() {
  const [assignmentName, setAssignmentName] = useState('');
  const [instructions, setInstructions] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);
  const { addProject, addTask } = useTaskStore();
  const { navigateToTool } = useToolNavigation();
  // Same one-shot guard as Task Breakdown's — a fast double-click on "Send to
  // Everything Pile" would otherwise create two duplicate projects, since two click
  // handlers can run back-to-back before React re-renders with a disabled button. See
  // useOnceGuard.ts.
  const sentGuard = useOnceGuard();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!assignmentName.trim() || !instructions.trim()) return;

    sentGuard.reset();
    const payload: AssignmentBreakdownPayload = {
      assignmentName: assignmentName.trim(),
      instructions: instructions.trim(),
    };
    run(JSON.stringify(payload));
  }

  const steps = output ? parseNumberedList(output) : [];

  // Always a new project named after the assignment — unlike Task Breakdown, this
  // tool has no "handoff from Everything Pile" origin to send steps back into
  // instead, since an assignment breakdown always starts fresh from a brief.
  function handleSendToEverythingPile() {
    if (sentGuard.hasFired()) return;
    sentGuard.markFired();
    const project = addProject(assignmentName.trim());
    steps.forEach((step) => {
      addTask({ title: step, projectId: project.id, size: 'small', category: 'now' });
    });
    navigateToTool('everything-pile');
  }

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Paste the assignment brief and give it a name. You'll get it back as a short
        list of concrete, startable steps — then you can drop them straight into
        Everything Pile as their own project.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <label className="tool-field">
          <span>Assignment name</span>
          <input
            type="text"
            value={assignmentName}
            onChange={(event) => setAssignmentName(event.target.value)}
            placeholder="e.g. Essay: The Causes of WWI"
            disabled={loading}
          />
        </label>

        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Paste the assignment instructions, requirements, or brief…"
          rows={6}
          disabled={loading}
        />

        <button type="submit" disabled={loading || !assignmentName.trim() || !instructions.trim()}>
          {loading ? 'Breaking it down…' : 'Break it down'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {steps.length > 0 && (
        <>
          <ol className="tool-result-list">
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <div className="tool-result-actions">
            <button type="button" onClick={handleSendToEverythingPile}>
              Send "{assignmentName.trim()}" to Everything Pile
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const assignmentBreakdownTool: ToolDefinition = {
  meta,
  Component: AssignmentBreakdown,
};
