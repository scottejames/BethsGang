import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { RemindersProvider, useReminders, computeNextOccurrence } from './RemindersContext';
import { AuthProvider } from './AuthContext';
import { client } from '../lib/dataClient';

const STORAGE_KEY = 'beths-gang:reminders';
const MIGRATION_FLAG_KEY = 'beths-gang:reminders-migrated';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

vi.mock('../lib/dataClient', () => ({
  client: {
    models: {
      Reminder: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RemindersProvider>{children}</RemindersProvider>
    </AuthProvider>
  );
}

describe('RemindersContext (signed out)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(client.models.Reminder.create).mockClear();
    vi.mocked(client.models.Reminder.update).mockClear();
    vi.mocked(client.models.Reminder.delete).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
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

    // Signed out throughout — none of this should have touched the backend.
    expect(client.models.Reminder.create).not.toHaveBeenCalled();
    expect(client.models.Reminder.update).not.toHaveBeenCalled();
    expect(client.models.Reminder.delete).not.toHaveBeenCalled();
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

  it('a repeating reminder missed for multiple days catches up in one silent jump, not a burst of duplicate due events', async () => {
    const now = new Date('2026-07-08T09:00:00');
    vi.setSystemTime(now);

    // 50 hours overdue — computeNextOccurrence only advances one calendar day at a
    // time, so a naive single-step catch-up would leave this reminder still in the
    // past after the first fire, forcing it to fire again on the next 15-second
    // check (and again after that) until it's finally caught up. Correct behavior:
    // exactly one "due" event, and the reminder already sitting at a future
    // occurrence right away — same as how a one-shot reminder catches up.
    const overdueReminder = {
      id: 'daily-1',
      message: 'take meds',
      fireAt: new Date(now.getTime() - 50 * 60 * 60 * 1000).toISOString(),
      warnedForCurrentFireAt: false,
      repeat: { kind: 'daily' as const },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([overdueReminder]));

    const { result } = renderHook(() => useReminders(), { wrapper });

    expect(result.current.firedEvents.filter((event) => event.kind === 'due')).toHaveLength(1);
    expect(new Date(result.current.reminders[0].fireAt).getTime()).toBeGreaterThan(now.getTime());

    // No further bursts on subsequent checks — it's already caught up.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.firedEvents.filter((event) => event.kind === 'due')).toHaveLength(1);
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

describe('RemindersContext (signed in)', () => {
  let observeQueryNext: ((data: { items: unknown[] }) => void) | undefined;

  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    observeQueryNext = undefined;

    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockResolvedValue({
      username: 'user-1',
      userId: 'user-1',
      signInDetails: { loginId: 'person@example.com' },
    });
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());

    vi.mocked(client.models.Reminder.observeQuery)
      .mockReset()
      .mockImplementation(
        (() => ({
          subscribe: (handlers: { next: (data: { items: unknown[] }) => void }) => {
            observeQueryNext = handlers.next;
            return { unsubscribe: vi.fn() };
          },
        })) as unknown as typeof client.models.Reminder.observeQuery,
      );
    vi.mocked(client.models.Reminder.create).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Reminder.update).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.Reminder.delete).mockReset().mockResolvedValue({ data: null });
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('addReminder creates a backend row, and the observeQuery echo drives displayed state', async () => {
    const now = new Date();

    const { result } = renderHook(() => useReminders(), { wrapper });
    await waitFor(() => expect(client.models.Reminder.observeQuery).toHaveBeenCalled());

    // Empty backend to start.
    act(() => observeQueryNext?.({ items: [] }));

    act(() => {
      result.current.addReminder({
        message: 'have lunch',
        fireAt: new Date(now.getTime() + 10 * 60 * 1000),
        repeat: { kind: 'none' },
      });
    });

    expect(client.models.Reminder.create).toHaveBeenCalledTimes(1);
    const createdInput = vi.mocked(client.models.Reminder.create).mock.calls[0][0];
    expect(createdInput).toMatchObject({ message: 'have lunch', repeat: JSON.stringify({ kind: 'none' }) });

    // Optimistic state already reflects it, before any echo.
    expect(result.current.reminders).toHaveLength(1);

    // Backend echoes the created row back — repeat comes back as a JSON string and
    // should be parsed back into a RepeatRule.
    act(() =>
      observeQueryNext?.({
        items: [
          {
            id: createdInput.id,
            message: 'have lunch',
            fireAt: createdInput.fireAt,
            warnBeforeMinutes: null,
            warnedForCurrentFireAt: false,
            repeat: JSON.stringify({ kind: 'none' }),
          },
        ],
      }),
    );

    expect(result.current.reminders).toHaveLength(1);
    expect(result.current.reminders[0].repeat).toEqual({ kind: 'none' });
  });

  it('cancelReminder deletes the backend row', async () => {
    const { result } = renderHook(() => useReminders(), { wrapper });
    await waitFor(() => expect(client.models.Reminder.observeQuery).toHaveBeenCalled());

    act(() =>
      observeQueryNext?.({
        items: [
          {
            id: 'reminder-1',
            message: 'water the plants',
            fireAt: new Date().toISOString(),
            warnBeforeMinutes: null,
            warnedForCurrentFireAt: false,
            repeat: JSON.stringify({ kind: 'none' }),
          },
        ],
      }),
    );
    expect(result.current.reminders).toHaveLength(1);

    act(() => {
      result.current.cancelReminder('reminder-1');
    });

    expect(client.models.Reminder.delete).toHaveBeenCalledWith({ id: 'reminder-1' });
  });

  it('migrates local-only reminders to the backend once, silently, on first sign-in', async () => {
    const localReminder = {
      id: 'local-1',
      message: 'pre-existing local reminder',
      fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      warnedForCurrentFireAt: false,
      repeat: { kind: 'none' as const },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([localReminder]));

    renderHook(() => useReminders(), { wrapper });

    await waitFor(() => expect(client.models.Reminder.create).toHaveBeenCalledTimes(1));
    expect(client.models.Reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-1', message: 'pre-existing local reminder' }),
    );
    await waitFor(() => expect(window.localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('true'));
  });

  it('does not re-migrate on a subsequent sign-in once the migration flag is set', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'local-1',
          message: 'already migrated',
          fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          warnedForCurrentFireAt: false,
          repeat: { kind: 'none' as const },
        },
      ]),
    );
    window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

    renderHook(() => useReminders(), { wrapper });
    await waitFor(() => expect(client.models.Reminder.observeQuery).toHaveBeenCalled());

    expect(client.models.Reminder.create).not.toHaveBeenCalled();
  });

  it('a reminder created while signed in is not visible after signing out (account data, not device data)', async () => {
    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useReminders(), { wrapper });
    await waitFor(() => expect(client.models.Reminder.observeQuery).toHaveBeenCalled());
    act(() => observeQueryNext?.({ items: [] }));

    act(() => {
      result.current.addReminder({
        message: 'account-only reminder',
        fireAt: new Date(Date.now() + 60 * 60 * 1000),
        repeat: { kind: 'none' },
      });
    });
    expect(result.current.reminders).toHaveLength(1);
    // The account's reminder is never written to localStorage while signed in — only
    // whatever was there from before sign-in (nothing, in this test).
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([]);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));
    act(() => {
      hubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() => expect(result.current.reminders).toHaveLength(0));
  });

  it('a pre-existing local reminder reappears intact after sign-out, with no account data mixed in', async () => {
    // Every existing sign-out test above only asserts the account's reminder
    // disappears. This asserts the actual pre-sign-in local content — not an empty
    // list, and not the account's reminder — is what's showing afterward.
    const localReminder = {
      id: 'local-1',
      message: 'local-only reminder',
      fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      warnedForCurrentFireAt: false,
      repeat: { kind: 'none' as const },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([localReminder]));
    // Already migrated on this device — otherwise mounting signed-in would upload the
    // local seed reminder above, which isn't what this test is checking.
    window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useReminders(), { wrapper });
    await waitFor(() => expect(client.models.Reminder.observeQuery).toHaveBeenCalled());
    // The account's backend data is entirely different from what's sitting locally.
    act(() =>
      observeQueryNext?.({
        items: [
          {
            id: 'acct-1',
            message: 'account reminder',
            fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            warnBeforeMinutes: null,
            warnedForCurrentFireAt: false,
            repeat: JSON.stringify({ kind: 'none' }),
          },
        ],
      }),
    );
    expect(result.current.reminders.map((reminder) => reminder.message)).toEqual(['account reminder']);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));
    act(() => {
      hubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() =>
      expect(result.current.reminders.map((reminder) => reminder.message)).toEqual(['local-only reminder']),
    );
  });
});
