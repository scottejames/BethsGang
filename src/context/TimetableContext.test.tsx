import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { TimetableProvider, useTimetable } from './TimetableContext';
import { AuthProvider } from './AuthContext';
import { client } from '../lib/dataClient';

const STORAGE_KEY = 'beths-gang:timetable';
const MIGRATION_FLAG_KEY = 'beths-gang:timetable-migrated';

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
      TimetableEntry: {
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
      <TimetableProvider>{children}</TimetableProvider>
    </AuthProvider>
  );
}

describe('TimetableContext (signed out)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(client.models.TimetableEntry.create).mockClear();
    vi.mocked(client.models.TimetableEntry.update).mockClear();
    vi.mocked(client.models.TimetableEntry.delete).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('fires an alert once the current time enters an entry\'s lead window, with the correct minutes-left text', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:44:00')); // a Monday, 16 min before start

    const { result } = renderHook(() => useTimetable(), { wrapper });
    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Maths', location: 'Room 4B' });
    });
    expect(result.current.alerts).toHaveLength(0); // still outside the default 15-min window

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000 + 1000); // now 08:45 — inside the window
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].text).toBe('Maths starts in 15 minutes — Room 4B');
  });

  it('does not fire for an entry on a different day of the week', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:50:00')); // Monday

    const { result } = renderHook(() => useTimetable(), { wrapper });
    act(() => {
      result.current.addEntry({ dayOfWeek: 'tuesday', startTime: '09:00', label: 'English' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(result.current.alerts).toHaveLength(0);
  });

  it('respects a per-entry alert lead time over the 15-minute default', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:31:00')); // 29 min before start

    const { result } = renderHook(() => useTimetable(), { wrapper });
    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Chemistry', alertMinutesBefore: 30 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].text).toContain('Chemistry starts in 29 minutes');
  });

  it('fires a catch-up alert on mount for an entry already inside its window', () => {
    vi.setSystemTime(new Date('2026-07-13T08:50:00'));
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'e1', dayOfWeek: 'monday', startTime: '09:00', label: 'Geography' }]),
    );

    const { result } = renderHook(() => useTimetable(), { wrapper });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].text).toContain('Geography');
  });

  it('does not catch up on mount for an entry whose start time has already passed', () => {
    vi.setSystemTime(new Date('2026-07-13T09:20:00')); // lesson started 20 min ago
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'e1', dayOfWeek: 'monday', startTime: '09:00', label: 'Geography' }]),
    );

    const { result } = renderHook(() => useTimetable(), { wrapper });

    expect(result.current.alerts).toHaveLength(0);
  });

  it('only fires an entry once per day, not on every tick while inside the window', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:50:00'));

    const { result } = renderHook(() => useTimetable(), { wrapper });
    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Art' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(result.current.alerts).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.alerts).toHaveLength(1); // still just the one
  });

  it('addEntry, updateEntry, and deleteEntry manage entries without touching the backend', () => {
    const { result } = renderHook(() => useTimetable(), { wrapper });

    act(() => {
      result.current.addEntry({ dayOfWeek: 'wednesday', startTime: '10:00', label: 'Art' });
    });
    expect(result.current.entries).toHaveLength(1);
    const id = result.current.entries[0].id;

    act(() => {
      result.current.updateEntry(id, { dayOfWeek: 'wednesday', startTime: '11:00', label: 'Art', location: 'Studio' });
    });
    expect(result.current.entries[0]).toMatchObject({ startTime: '11:00', location: 'Studio' });

    act(() => {
      result.current.deleteEntry(id);
    });
    expect(result.current.entries).toHaveLength(0);

    expect(client.models.TimetableEntry.create).not.toHaveBeenCalled();
    expect(client.models.TimetableEntry.update).not.toHaveBeenCalled();
    expect(client.models.TimetableEntry.delete).not.toHaveBeenCalled();
  });

  it('copyDay replaces each target day\'s lessons with fresh copies of the source day\'s, not a merge', () => {
    const { result } = renderHook(() => useTimetable(), { wrapper });

    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Maths' });
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '10:00', label: 'English' });
      result.current.addEntry({ dayOfWeek: 'tuesday', startTime: '13:00', label: 'PE' }); // should be replaced
    });

    act(() => {
      result.current.copyDay('monday', ['tuesday', 'wednesday']);
    });

    const tuesday = result.current.entries.filter((e) => e.dayOfWeek === 'tuesday');
    const wednesday = result.current.entries.filter((e) => e.dayOfWeek === 'wednesday');
    expect(tuesday.map((e) => e.label).sort()).toEqual(['English', 'Maths']);
    expect(wednesday.map((e) => e.label).sort()).toEqual(['English', 'Maths']);
    // Copies get their own ids, not the source's.
    const monday = result.current.entries.filter((e) => e.dayOfWeek === 'monday');
    expect(tuesday[0].id).not.toBe(monday[0].id);
  });

  it('dismissAlert removes a fired alert', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:50:00'));
    const { result } = renderHook(() => useTimetable(), { wrapper });
    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'History' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(result.current.alerts).toHaveLength(1);

    act(() => {
      result.current.dismissAlert(result.current.alerts[0].id);
    });
    expect(result.current.alerts).toHaveLength(0);
  });
});

describe('TimetableContext (signed in)', () => {
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

    vi.mocked(client.models.TimetableEntry.observeQuery)
      .mockReset()
      .mockImplementation(
        (() => ({
          subscribe: (handlers: { next: (data: { items: unknown[] }) => void }) => {
            observeQueryNext = handlers.next;
            return { unsubscribe: vi.fn() };
          },
        })) as unknown as typeof client.models.TimetableEntry.observeQuery,
      );
    vi.mocked(client.models.TimetableEntry.create).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.TimetableEntry.update).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.TimetableEntry.delete).mockReset().mockResolvedValue({ data: null });
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(MIGRATION_FLAG_KEY);
  });

  it('addEntry creates a backend row (HH:mm converted to AWSTime), and the observeQuery echo drives displayed state', async () => {
    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(client.models.TimetableEntry.observeQuery).toHaveBeenCalled());
    act(() => observeQueryNext?.({ items: [] }));

    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Maths', location: 'Room 4B' });
    });

    expect(client.models.TimetableEntry.create).toHaveBeenCalledTimes(1);
    const createdInput = vi.mocked(client.models.TimetableEntry.create).mock.calls[0][0];
    expect(createdInput).toMatchObject({ dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths', location: 'Room 4B' });

    expect(result.current.entries).toHaveLength(1); // optimistic, before any echo

    act(() =>
      observeQueryNext?.({
        items: [
          {
            id: createdInput.id,
            dayOfWeek: 'monday',
            startTime: '09:00:00',
            endTime: null,
            label: 'Maths',
            location: 'Room 4B',
            alertMinutesBefore: null,
          },
        ],
      }),
    );

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].startTime).toBe('09:00'); // converted back from AWSTime
  });

  it('deleteEntry deletes the backend row', async () => {
    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(client.models.TimetableEntry.observeQuery).toHaveBeenCalled());

    act(() =>
      observeQueryNext?.({
        items: [{ id: 'entry-1', dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths' }],
      }),
    );
    expect(result.current.entries).toHaveLength(1);

    act(() => {
      result.current.deleteEntry('entry-1');
    });

    expect(client.models.TimetableEntry.delete).toHaveBeenCalledWith({ id: 'entry-1' });
  });

  it('copyDay creates backend rows for each new copy and deletes the replaced target-day rows', async () => {
    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(client.models.TimetableEntry.observeQuery).toHaveBeenCalled());

    act(() =>
      observeQueryNext?.({
        items: [
          { id: 'mon-1', dayOfWeek: 'monday', startTime: '09:00:00', label: 'Maths' },
          { id: 'tue-1', dayOfWeek: 'tuesday', startTime: '13:00:00', label: 'PE' },
        ],
      }),
    );

    act(() => {
      result.current.copyDay('monday', ['tuesday']);
    });

    expect(client.models.TimetableEntry.delete).toHaveBeenCalledWith({ id: 'tue-1' });
    expect(client.models.TimetableEntry.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.models.TimetableEntry.create).mock.calls[0][0]).toMatchObject({
      dayOfWeek: 'tuesday',
      label: 'Maths',
    });
  });

  it('migrates local-only entries to the backend once, silently, on first sign-in', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'local-1', dayOfWeek: 'friday', startTime: '12:00', label: 'Music' }]),
    );

    renderHook(() => useTimetable(), { wrapper });

    await waitFor(() => expect(client.models.TimetableEntry.create).toHaveBeenCalledTimes(1));
    expect(client.models.TimetableEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-1', label: 'Music', startTime: '12:00:00' }),
    );
    await waitFor(() => expect(window.localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('true'));
  });

  it('an entry created while signed in is not visible after signing out (account data, not device data)', async () => {
    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useTimetable(), { wrapper });
    await waitFor(() => expect(client.models.TimetableEntry.observeQuery).toHaveBeenCalled());
    act(() => observeQueryNext?.({ items: [] }));

    act(() => {
      result.current.addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'account-only lesson' });
    });
    expect(result.current.entries).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([]);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));
    act(() => {
      hubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(0));
  });
});
