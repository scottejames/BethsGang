import { useEffect, useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { useTaskStore } from '../../context/TaskStoreContext';
import { useToolNavigation } from '../../context/ToolNavigationContext';
import { useOnceGuard } from '../../hooks/useOnceGuard';
import { parseNumberedList } from '../../lib/parseNumberedList';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface Origin {
  projectId: string;
  projectName: string;
}

function TaskBreakdown() {
  const [task, setTask] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);
  const { pendingBreakdownRequest, clearBreakdownRequest, navigateToTool } = useToolNavigation();
  const { addProject, addTask } = useTaskStore();
  const [origin, setOrigin] = useState<Origin | null>(null);
  // Guards against a fast double-click sending the same breakdown twice — see
  // useOnceGuard.ts for why this needs to be a ref rather than a state check.
  const sentGuard = useOnceGuard();

  // One-shot pickup of a handoff from Everything Pile's "Break down" button (see
  // ToolNavigationContext.tsx) — pre-fills the task text and remembers which project
  // to send the resulting steps back into, so that trip is a round trip into the same
  // project rather than creating a duplicate. Runs once on mount, not reactively:
  // there's no router, so navigating here is always a fresh mount, and a stale
  // pendingBreakdownRequest from some earlier session should never resurface.
  useEffect(() => {
    if (pendingBreakdownRequest) {
      setTask(pendingBreakdownRequest.prefillText);
      setOrigin({ projectId: pendingBreakdownRequest.projectId, projectName: pendingBreakdownRequest.projectName });
      clearBreakdownRequest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (task.trim()) {
      sentGuard.reset();
      run(task.trim());
    }
  }

  const steps = output ? parseNumberedList(output) : [];

  // Sends this session's steps to Everything Pile: into the project this session
  // started from (if any — see the mount effect above), or a new project named after
  // the task otherwise. Small and "now" by default, matching Task Breakdown's own
  // framing — these are "small, concrete, startable steps" you just asked for.
  function handleSendToEverythingPile() {
    if (sentGuard.hasFired()) return;
    sentGuard.markFired();
    const targetProjectId = origin ? origin.projectId : addProject(task.trim()).id;
    steps.forEach((step) => {
      addTask({ title: step, projectId: targetProjectId, size: 'small', category: 'now' });
    });
    navigateToTool('everything-pile');
  }

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Describe the task that's stuck in your head. You'll get it back as a short list of small,
        concrete steps you can start right away.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="e.g. Sort out my taxes"
          rows={4}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !task.trim()}>
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
              {origin ? `Add to "${origin.projectName}"` : 'Send to Everything Pile'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export const taskBreakdownTool: ToolDefinition = {
  meta,
  Component: TaskBreakdown,
};
