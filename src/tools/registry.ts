import type { ToolDefinition } from './types';
import { taskBreakdownTool } from './taskBreakdown';
import { toneCheckerTool } from './toneChecker';
import { replyStarterTool } from './replyStarter';
import { pomodoroTimerTool } from './pomodoroTimer';
import { whiteNoiseTool } from './whiteNoise';

// To add a new tool: create a folder under src/tools with a meta.ts + index.tsx,
// then list it here. That's the entire integration surface for the UI.
export const tools: ToolDefinition[] = [
  whiteNoiseTool,
  pomodoroTimerTool,
  taskBreakdownTool,
  toneCheckerTool,
  replyStarterTool,
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.meta.id === id);
}
