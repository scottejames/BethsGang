import type { ToolDefinition } from './types';
import { taskBreakdownTool } from './taskBreakdown';
import { toneCheckerTool } from './toneChecker';
import { replyStarterTool } from './replyStarter';
import { pomodoroTimerTool } from './pomodoroTimer';
import { distractMeTool } from './distractMe';
import { callScriptTool } from './callScript';
import { isThisMadTool } from './isThisMad';
import { remindMeTool } from './remindMe';
import { everythingPileTool } from './everythingPile';
import { dopamineMenuTool } from './dopamineMenu';
import { sideQuestLogTool } from './sideQuestLog';
import { brainDumpSorterTool } from './brainDumpSorter';
import { essayPhraseBankTool } from './essayPhraseBank';
import { assignmentBreakdownTool } from './assignmentBreakdown';
import { essayStructurePlannerTool } from './essayStructurePlanner';
import { timetableTool } from './timetable';
import { cooksCornerTool } from './cooksCorner';

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
  everythingPileTool,
  dopamineMenuTool,
  sideQuestLogTool,
  brainDumpSorterTool,
  essayPhraseBankTool,
  assignmentBreakdownTool,
  essayStructurePlannerTool,
  timetableTool,
  cooksCornerTool,
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.meta.id === id);
}
