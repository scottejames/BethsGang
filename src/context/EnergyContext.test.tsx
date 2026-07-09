import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { EnergyProvider, useEnergy } from './EnergyContext';
import { AuthProvider } from './AuthContext';
import { client } from '../lib/dataClient';

const STORAGE_KEY = 'beths-gang:energy-spoons';

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
      UserPreferences: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>{children}</EnergyProvider>
    </AuthProvider>
  );
}

describe('EnergyContext (signed out)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(client.models.UserPreferences.create).mockClear();
    vi.mocked(client.models.UserPreferences.update).mockClear();
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults to 70 with nothing stored', () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });
    expect(result.current.spoons).toBe(70);
  });

  it('reads a previously stored value', () => {
    window.localStorage.setItem(STORAGE_KEY, '30');
    const { result } = renderHook(() => useEnergy(), { wrapper });
    expect(result.current.spoons).toBe(30);
  });

  it('setSpoons clamps to [0, 100], rounds, and persists locally without touching the backend', () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });

    act(() => result.current.setSpoons(150));
    expect(result.current.spoons).toBe(100);

    act(() => result.current.setSpoons(-20));
    expect(result.current.spoons).toBe(0);

    act(() => result.current.setSpoons(42.6));
    expect(result.current.spoons).toBe(43);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('43');

    expect(client.models.UserPreferences.create).not.toHaveBeenCalled();
    expect(client.models.UserPreferences.update).not.toHaveBeenCalled();
  });
});

describe('EnergyContext (signed in)', () => {
  let observeQueryNext: ((data: { items: { spoons: number }[] }) => void) | undefined;

  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    observeQueryNext = undefined;

    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockResolvedValue({
      username: 'user-1',
      userId: 'user-1',
      signInDetails: { loginId: 'person@example.com' },
    });
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());

    vi.mocked(client.models.UserPreferences.observeQuery)
      .mockReset()
      .mockImplementation(
        (() => ({
          subscribe: (handlers: { next: (data: { items: { spoons: number }[] }) => void }) => {
            observeQueryNext = handlers.next;
            return { unsubscribe: vi.fn() };
          },
        })) as unknown as typeof client.models.UserPreferences.observeQuery,
      );
    vi.mocked(client.models.UserPreferences.create).mockReset().mockResolvedValue({ data: null });
    vi.mocked(client.models.UserPreferences.update).mockReset().mockResolvedValue({ data: null });
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('a brand-new account (no backend row yet) seeds the backend from the local value', async () => {
    window.localStorage.setItem(STORAGE_KEY, '55');

    renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(client.models.UserPreferences.observeQuery).toHaveBeenCalled());

    act(() => observeQueryNext?.({ items: [] }));

    await waitFor(() =>
      expect(client.models.UserPreferences.create).toHaveBeenCalledWith({ id: 'user-1', spoons: 55 }),
    );
  });

  it('a returning user (backend row already exists) has the backend value win over local', async () => {
    window.localStorage.setItem(STORAGE_KEY, '10'); // stale local value on this device

    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(client.models.UserPreferences.observeQuery).toHaveBeenCalled());

    act(() => observeQueryNext?.({ items: [{ spoons: 90 }] }));

    expect(result.current.spoons).toBe(90);
    expect(client.models.UserPreferences.create).not.toHaveBeenCalled();
    // Account data is never mirrored to localStorage while signed in — it must not
    // linger locally after a sign-out (see the "reverts on sign-out" test below).
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('10');
  });

  it('setSpoons updates the backend row optimistically', async () => {
    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(client.models.UserPreferences.observeQuery).toHaveBeenCalled());
    act(() => observeQueryNext?.({ items: [{ spoons: 50 }] }));

    act(() => result.current.setSpoons(20));

    expect(result.current.spoons).toBe(20);
    expect(client.models.UserPreferences.update).toHaveBeenCalledWith({ id: 'user-1', spoons: 20 });
  });

  it('setSpoons falls back to create() if update() fails because no row exists yet', async () => {
    vi.mocked(client.models.UserPreferences.update).mockRejectedValue(new Error('no such row'));

    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(client.models.UserPreferences.observeQuery).toHaveBeenCalled());

    await act(async () => {
      result.current.setSpoons(65);
      await Promise.resolve();
    });

    expect(client.models.UserPreferences.update).toHaveBeenCalledWith({ id: 'user-1', spoons: 65 });
    await waitFor(() =>
      expect(client.models.UserPreferences.create).toHaveBeenCalledWith({ id: 'user-1', spoons: 65 }),
    );
  });

  it('reverts to this device\'s pre-sign-in local value on sign-out, not the account value', async () => {
    window.localStorage.setItem(STORAGE_KEY, '10');

    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(client.models.UserPreferences.observeQuery).toHaveBeenCalled());
    act(() => observeQueryNext?.({ items: [{ spoons: 90 }] }));
    expect(result.current.spoons).toBe(90);

    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));
    act(() => {
      hubCallback?.({ payload: { event: 'signedOut' } });
    });

    await waitFor(() => expect(result.current.spoons).toBe(10));
    // The account's 90 was never written to localStorage in the first place.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('10');
  });
});
