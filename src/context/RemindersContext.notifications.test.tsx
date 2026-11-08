import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from './AuthContext';
import { RemindersProvider, useReminders } from './RemindersContext';

vi.mock('aws-amplify/auth', () => ({ getCurrentUser: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn(() => vi.fn()) } }));
vi.mock('../lib/dataClient', () => ({ client: { models: { Reminder: {} } } }));

const STORAGE_KEY = 'beths-gang:reminders';
const NOW = new Date('2026-07-08T14:00:00');

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RemindersProvider>{children}</RemindersProvider>
    </AuthProvider>
  );
}

const shown: string[] = [];
const requestPermission = vi.fn();

function stubNotification(permission: NotificationPermission, onCreate?: () => void) {
  vi.stubGlobal(
    'Notification',
    class {
      static permission = permission;
      static requestPermission = requestPermission;
      constructor(title: string) {
        onCreate?.();
        shown.push(title);
      }
    },
  );
}

async function setUpReminder() {
  const view = renderHook(() => useReminders(), { wrapper });
  await act(() => vi.advanceTimersByTimeAsync(0));
  act(() => {
    view.result.current.addReminder({
      message: 'have lunch',
      fireAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      warnBeforeMinutes: 5,
      repeat: { kind: 'none' },
    });
  });
  return view;
}

const pass = (minutes: number) => act(() => vi.advanceTimersByTimeAsync(minutes * 60 * 1000));

describe('reminder browser notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    shown.length = 0;
    requestPermission.mockReset().mockResolvedValue('default');
    window.localStorage.removeItem(STORAGE_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('asks for permission when a reminder is set and the browser has not asked yet', async () => {
    stubNotification('default');

    await setUpReminder();

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it.each(['granted', 'denied'] as const)('does not ask again when already %s', async (permission) => {
    stubNotification(permission);

    await setUpReminder();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('notifies for both the warning and the due time when permission is granted', async () => {
    stubNotification('granted');
    await setUpReminder();

    await pass(6);
    expect(shown).toEqual(['Coming up: have lunch']);

    await pass(5);
    expect(shown).toEqual(['Coming up: have lunch', 'Reminder: have lunch']);
  });

  // Whatever happens to the browser notification, the in-app banner must still fire.
  it('shows no notification but still fires in the app when permission is denied', async () => {
    stubNotification('denied');
    const { result } = await setUpReminder();

    await pass(11);

    expect(shown).toEqual([]);
    expect(result.current.firedEvents.map((event) => event.kind)).toEqual(['warning', 'due']);
  });

  it('still fires in the app on a browser with no notification support', async () => {
    vi.stubGlobal('Notification', undefined);
    const { result } = await setUpReminder();

    await pass(11);

    expect(result.current.firedEvents).toHaveLength(2);
  });

  it('still fires in the app if creating the notification throws', async () => {
    stubNotification('granted', () => {
      throw new TypeError('Illegal constructor');
    });
    const { result } = await setUpReminder();

    await pass(11);

    expect(result.current.firedEvents).toHaveLength(2);
  });
});
