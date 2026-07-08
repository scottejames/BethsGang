import { useEnergy } from '../context/EnergyContext';
import { sendUsageEvent } from '../lib/usageLog';
import type { UsageEventKind } from '../lib/usageLog';

// Thin wrapper so call sites don't each need to pull spoons from EnergyContext
// themselves — see src/lib/usageLog.ts for what actually gets sent and why.
export function useUsageLog() {
  const { spoons } = useEnergy();

  return function logUsage(toolId: string, event: UsageEventKind, detail?: Record<string, unknown>) {
    sendUsageEvent({ toolId, event, spoons, detail });
  };
}
