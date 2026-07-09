import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ToolNavigationProvider, useToolNavigation } from './ToolNavigationContext';

const mockLogUsage = vi.fn();
vi.mock('../hooks/useUsageLog', () => ({
  useUsageLog: () => mockLogUsage,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ToolNavigationProvider>{children}</ToolNavigationProvider>;
}

describe('ToolNavigationContext', () => {
  beforeEach(() => {
    mockLogUsage.mockClear();
  });

  it('starts on Home (activeToolId null)', () => {
    const { result } = renderHook(() => useToolNavigation(), { wrapper });
    expect(result.current.activeToolId).toBeNull();
  });

  it('navigateToTool sets activeToolId and logs an "opened" usage event', () => {
    const { result } = renderHook(() => useToolNavigation(), { wrapper });

    act(() => result.current.navigateToTool('task-breakdown'));

    expect(result.current.activeToolId).toBe('task-breakdown');
    expect(mockLogUsage).toHaveBeenCalledWith('task-breakdown', 'opened');
  });

  it('goHome clears activeToolId', () => {
    const { result } = renderHook(() => useToolNavigation(), { wrapper });

    act(() => result.current.navigateToTool('task-breakdown'));
    act(() => result.current.goHome());

    expect(result.current.activeToolId).toBeNull();
  });

  it('requestTaskBreakdown / clearBreakdownRequest round-trips the pending handoff', () => {
    const { result } = renderHook(() => useToolNavigation(), { wrapper });
    expect(result.current.pendingBreakdownRequest).toBeNull();

    act(() =>
      result.current.requestTaskBreakdown({
        projectId: 'p1',
        projectName: 'Kitchen reno',
        prefillText: 'Kitchen reno',
      }),
    );
    expect(result.current.pendingBreakdownRequest).toEqual({
      projectId: 'p1',
      projectName: 'Kitchen reno',
      prefillText: 'Kitchen reno',
    });

    act(() => result.current.clearBreakdownRequest());
    expect(result.current.pendingBreakdownRequest).toBeNull();
  });
});
