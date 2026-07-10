import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function parseResult(output: string) {
  const lines = output.split('\n').map((line) => line.trim());
  const get = (label: string) =>
    lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();

  return {
    estimate: get('Realistic estimate:'),
    buffer: get('Buffer:'),
    blockOff: get('Block off:'),
  };
}

function TimeEstimator() {
  const [task, setTask] = useState('');
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (task.trim()) {
      run(task.trim());
    }
  }

  const result = output ? parseResult(output) : null;
  const hasResult = result && (result.estimate || result.buffer || result.blockOff);

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Describe the task you're about to start. You'll get a realistic estimate, a
        buffer for the stuff that always eats time, and a single number to actually
        block off.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="e.g. Drop the car off for its MOT"
          rows={4}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !task.trim()}>
          {loading ? 'Estimating…' : 'Estimate it'}
        </button>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {hasResult && (
        <dl className="tool-result-fields">
          {result?.estimate && (
            <>
              <dt>Realistic estimate</dt>
              <dd>{result.estimate}</dd>
            </>
          )}
          {result?.buffer && (
            <>
              <dt>Buffer</dt>
              <dd>{result.buffer}</dd>
            </>
          )}
          {result?.blockOff && (
            <>
              <dt>Block off</dt>
              <dd>{result.blockOff}</dd>
            </>
          )}
        </dl>
      )}
      {output && !hasResult && <p className="tool-result-plain">{output}</p>}
    </div>
  );
}

export const timeEstimatorTool: ToolDefinition = {
  meta,
  Component: TimeEstimator,
};
