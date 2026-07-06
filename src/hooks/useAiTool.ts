import { useCallback, useState } from 'react';
import { runAiTool } from '../lib/aiClient';

export function useAiTool(toolId: string) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: string) => {
      setLoading(true);
      setError(null);
      setOutput(null);
      try {
        const result = await runAiTool(toolId, input);
        setOutput(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [toolId],
  );

  return { output, loading, error, run };
}
