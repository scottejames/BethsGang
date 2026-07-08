import { useCallback, useState } from 'react';
import { runAiTool } from '../lib/aiClient';
import { useEnergy } from '../context/EnergyContext';
import { sendUsageEvent, summarizeInputForLogging } from '../lib/usageLog';

export function useAiTool(toolId: string) {
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { spoons } = useEnergy();

  // Every AI tool's request is wrapped with the current energy level, so the
  // Lambda can adjust response complexity/sophistication uniformly — tool
  // components never need to know this happens. See ai-assist/handler.ts's
  // parseEnvelope + buildEnergyInstruction.
  const run = useCallback(
    async (input: string) => {
      setLoading(true);
      setError(null);
      setOutput(null);
      try {
        const envelope = JSON.stringify({ spoons, input });
        const result = await runAiTool(toolId, envelope);
        setOutput(result);
        sendUsageEvent({
          toolId,
          event: 'ai_call',
          spoons,
          detail: { ...summarizeInputForLogging(input), success: true },
        });
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        sendUsageEvent({
          toolId,
          event: 'ai_call',
          spoons,
          detail: { ...summarizeInputForLogging(input), success: false },
        });
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [toolId, spoons],
  );

  return { output, loading, error, run };
}
