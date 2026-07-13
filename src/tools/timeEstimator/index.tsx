import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { makeLabelGetter } from '../../lib/parseLabeledOutput';
import { StructuredResult } from '../../components/StructuredResult';
import type { StructuredField } from '../../components/StructuredResult';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function parseResult(output: string) {
  const get = makeLabelGetter(output);

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
  const fields = [
    result?.estimate && ({ label: 'Realistic estimate', value: result.estimate } as StructuredField),
    result?.buffer && ({ label: 'Buffer', value: result.buffer } as StructuredField),
    result?.blockOff && ({ label: 'Block off', value: result.blockOff } as StructuredField),
  ].filter((field): field is StructuredField => Boolean(field));

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

      <StructuredResult fields={fields} rawOutput={output} />
    </div>
  );
}

export const timeEstimatorTool: ToolDefinition = {
  meta,
  Component: TimeEstimator,
};
