import type { ToolDefinition } from './types';
import { taskBreakdownTool } from './taskBreakdown';
import { toneCheckerTool } from './toneChecker';

// To add a new tool: create a folder under src/tools with a meta.ts + index.tsx,
// then list it here. That's the entire integration surface for the UI.
export const tools: ToolDefinition[] = [taskBreakdownTool, toneCheckerTool];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.meta.id === id);
}
