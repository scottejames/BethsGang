import type { ToolDefinition } from './types';
import { taskBreakdownTool } from './taskBreakdown';
import { toneCheckerTool } from './toneChecker';
import { replyStarterTool } from './replyStarter';
import { pomodoroTimerTool } from './pomodoroTimer';
import { distractMeTool } from './distractMe';
import { callScriptTool } from './callScript';
import { isThisMadTool } from './isThisMad';
import { remindMeTool } from './remindMe';

// To add a new tool: create a folder under src/tools with a meta.ts + index.tsx,
// then list it here. That's the entire integration surface for the UI.
export const tools: ToolDefinition[] = [
  distractMeTool,
  pomodoroTimerTool,
  taskBreakdownTool,
  toneCheckerTool,
  replyStarterTool,
  callScriptTool,
  isThisMadTool,
  remindMeTool,
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.meta.id === id);
}
