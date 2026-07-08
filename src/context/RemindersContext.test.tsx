import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { RemindersProvider, useReminders, computeNextOccurrence } from './RemindersContext';

const STORAGE_KEY = 'beths-gang:reminders';

function wrapper({ children }: { children: ReactNode }) {
  return <RemindersProvider>{children}</RemindersProvider>;
}

describe('RemindersContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('fires a warning before the due time, then a due event, and drops a one-shot reminder', async () => {
    const now = new Date('2026-07-08T14:00:00');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useReminders(), { wrapper });

    act(() => {
      result.current.addReminder({
        message: 'have lunch',
        fireAt: new Date(now.getTime() + 10 * 60 * 1000),
        warnBeforeMinutes: 5,
        repeat: { kind: 'none' },
      });
    });

    expect(result.current.reminders).toHaveLength(1);

    // Advance to 5 minutes in — past the warn threshold, still before fireAt.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    });

    expect(result.current.firedEvents).toHaveLength(1);
    expect(result.current.firedEvents[0].kind).toBe('warning');
    expect(result.current.reminders[0].warnedForCurrentFireAt).toBe(true);

    // Advance past fireAt.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    });

    expect(result.current.firedEvents).toHaveLength(2);
    expect(result.current.firedEvents[1].kind).toBe('due');
    expect(result.current.reminders).toHaveLength(0); // one-shot — dropped after firing
  });

  it('reschedules a daily reminder with computeNextOccurrence instead of dropping it', async () => {
    const now = new Date('2026-07-08T09:00:00');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useReminders(), { wrapper });
    const fireAt = new Date(now.getTime() + 60 * 1000);

    act(() => {
      result.current.addReminder({ message: 'take meds', fireAt, repeat: { kind: 'daily' } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75 * 1000);
    });

    expect(result.current.reminders).toHaveLength(1);
    expect(result.current.reminders[0].warnedForCurrentFireAt).toBe(false);
    expect(new Date(result.current.reminders[0].fireAt)).toEqual(
      computeNextOccurrence(fireAt, { kind: 'daily' }),
    );
  });

  it('reschedules a weekdays reminder to skip the weekend', () => {
    const friday = new Date('2026-07-10T09:00:00'); // a Friday
    const monday = computeNextOccurrence(friday, { kind: 'weekdays' });
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(13);
  });

  it('fires a catch-up due event on mount for a reminder that was already overdue', () => {
    const now = new Date('2026-07-08T09:00:00');
    vi.setSystemTime(now);

    const overdueReminder = {
      id: 'existing-1',
      message: 'water the plants',
      fireAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      warnedForCurrentFireAt: false,
      repeat: { kind: 'none' as const },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([overdueReminder]));

    const { result } = renderHook(() => useReminders(), { wrapper });

    expect(result.current.firedEvents).toHaveLength(1);
    expect(result.current.firedEvents[0].kind).toBe('due');
    expect(result.current.reminders).toHaveLength(0);
  });

  it('cancelReminder removes a reminder and dismissEvent removes a fired event', async () => {
    const now = new Date('2026-07-08T14:00:00');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useReminders(), { wrapper });

    act(() => {
      result.current.addReminder({
        message: 'stretch',
        fireAt: new Date(now.getTime() + 60 * 1000),
        repeat: { kind: 'none' },
      });
    });
    const id = result.current.reminders[0].id;

    act(() => {
      result.current.cancelReminder(id);
    });
    expect(result.current.reminders).toHaveLength(0);

    act(() => {
      result.current.addReminder({
        message: 'due now',
        fireAt: new Date(now.getTime() - 1000),
        repeat: { kind: 'none' },
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(result.current.firedEvents).toHaveLength(1);

    act(() => {
      result.current.dismissEvent(result.current.firedEvents[0].id);
    });
    expect(result.current.firedEvents).toHaveLength(0);
  });
});
