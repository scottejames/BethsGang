import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function TaskBreakdown() {
  const [task, setTask] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (task.trim()) {
      run(task.trim());
    }
  }

  const steps = output
    ? output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

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
        <ol className="tool-result-list">
          {steps.map((step, index) => (
            <li key={index}>{step.replace(/^\d+\.\s*/, '')}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export const taskBreakdownTool: ToolDefinition = {
  meta,
  Component: TaskBreakdown,
};
