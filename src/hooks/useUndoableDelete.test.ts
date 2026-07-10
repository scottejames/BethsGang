import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUndoableDelete } from './useUndoableDelete';

describe('useUndoableDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks an item pending immediately but does not commit the delete right away', () => {
    const commitDelete = vi.fn();
    const { result } = renderHook(() => useUndoableDelete<{ id: string }>(commitDelete));

    act(() => {
      result.current.requestDelete('a', { id: 'a' }, 'Task A');
    });

    expect(result.current.isPending('a')).toBe(true);
    expect(commitDelete).not.toHaveBeenCalled();
  });

  it('commits the delete once the undo window elapses with no undo', () => {
    const commitDelete = vi.fn();
    const { result } = renderHook(() => useUndoableDelete<{ id: string }>(commitDelete));

    act(() => {
      result.current.requestDelete('a', { id: 'a' }, 'Task A');
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(commitDelete).toHaveBeenCalledWith({ id: 'a' });
    expect(result.current.isPending('a')).toBe(false);
  });

  it('undo cancels the pending delete — commitDelete is never called', () => {
    const commitDelete = vi.fn();
    const { result } = renderHook(() => useUndoableDelete<{ id: string }>(commitDelete));

    act(() => {
      result.current.requestDelete('a', { id: 'a' }, 'Task A');
    });
    act(() => {
      result.current.undo('a');
    });

    expect(result.current.isPending('a')).toBe(false);

    // Even after the window would have elapsed, nothing fires — the timer was cleared.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(commitDelete).not.toHaveBeenCalled();
  });

  it('tracks multiple concurrent pending deletes independently', () => {
    const commitDelete = vi.fn();
    const { result } = renderHook(() => useUndoableDelete<{ id: string }>(commitDelete));

    act(() => {
      result.current.requestDelete('a', { id: 'a' }, 'Task A');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      result.current.requestDelete('b', { id: 'b' }, 'Task B');
    });

    expect(result.current.isPending('a')).toBe(true);
    expect(result.current.isPending('b')).toBe(true);

    // 'a' was requested 2s earlier, so it commits first.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(commitDelete).toHaveBeenCalledWith({ id: 'a' });
    expect(commitDelete).toHaveBeenCalledTimes(1);
    expect(result.current.isPending('b')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(commitDelete).toHaveBeenCalledWith({ id: 'b' });
    expect(commitDelete).toHaveBeenCalledTimes(2);
  });
});
