import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useUsageLog } from '../hooks/useUsageLog';
import type { ToolCategory } from '../tools/types';

// The specific payload for the Everything Pile -> Task Breakdown link (not a
// generic "any payload" system — kept narrow on purpose, easy to extend with another
// named slot like this one if/when a second tool-to-tool link needs it).
export interface TaskBreakdownRequest {
  projectId: string;
  projectName: string;
  prefillText: string;
}

interface ToolNavigationContextValue {
  activeToolId: string | null;
  navigateToTool: (id: string) => void;
  goHome: () => void;
  pendingBreakdownRequest: TaskBreakdownRequest | null;
  requestTaskBreakdown: (request: TaskBreakdownRequest) => void;
  clearBreakdownRequest: () => void;
  // Which of Home's tabs was showing (see TABS in Home.tsx for their current
  // labels). Lives here rather than as local state in Home.tsx specifically so it
  // survives Home unmounting when a tool opens — without this, going back from a
  // tool always landed back on whichever tab was first (Home's local state
  // remounting to its default) regardless of which tab you'd actually opened the
  // tool from. Home only ever writes this via its own tab clicks — selecting a tool
  // never needs to touch it, since a tool can only be clicked from whichever tab is
  // already showing it.
  activeCategory: ToolCategory;
  setActiveCategory: (category: ToolCategory) => void;
}

const ToolNavigationContext = createContext<ToolNavigationContextValue | null>(null);

// Owns which tool is active — previously local state in App.tsx, promoted here so any
// tool can navigate to another tool directly (not just Home), which is what any
// tool-to-tool link (this one, and future ones per TODO.md's "Linking tools together")
// actually needs. Also centralizes the "opened" usage-log event here, so every
// navigation path is covered the same way regardless of entry point — App.tsx no
// longer needs its own logging call for the Home-click path specifically.
export function ToolNavigationProvider({ children }: { children: ReactNode }) {
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [pendingBreakdownRequest, setPendingBreakdownRequest] = useState<TaskBreakdownRequest | null>(null);
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('general');
  const logUsage = useUsageLog();

  function navigateToTool(id: string) {
    logUsage(id, 'opened');
    setActiveToolId(id);
  }

  function goHome() {
    setActiveToolId(null);
  }

  function requestTaskBreakdown(request: TaskBreakdownRequest) {
    setPendingBreakdownRequest(request);
  }

  function clearBreakdownRequest() {
    setPendingBreakdownRequest(null);
  }

  return (
    <ToolNavigationContext.Provider
      value={{
        activeToolId,
        navigateToTool,
        goHome,
        pendingBreakdownRequest,
        requestTaskBreakdown,
        clearBreakdownRequest,
        activeCategory,
        setActiveCategory,
      }}
    >
      {children}
    </ToolNavigationContext.Provider>
  );
}

export function useToolNavigation(): ToolNavigationContextValue {
  const context = useContext(ToolNavigationContext);
  if (!context) {
    throw new Error('useToolNavigation must be used within a ToolNavigationProvider');
  }
  return context;
}
