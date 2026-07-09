import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.mocked(amplifyAuth.getCurrentUser).mockReset();
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reflects a signed-out session (getCurrentUser rejects) once loading settles', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValue(new Error('not signed in'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('reflects an already-persisted signed-in session on mount', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      username: 'user-1',
      userId: 'user-1',
      signInDetails: { loginId: 'person@example.com' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.user).toEqual({ username: 'user-1', email: 'person@example.com' });
  });

  it('updates to signed-in when the Hub fires a signedIn event (e.g. from the Authenticator)', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockRejectedValueOnce(new Error('not signed in'));

    let hubCallback: ((event: { payload: { event: string } }) => void) | undefined;
    vi.mocked(Hub.listen).mockImplementation((_channel, callback) => {
      hubCallback = callback as typeof hubCallback;
      return vi.fn();
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSignedIn).toBe(false);

    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      username: 'user-2',
      userId: 'user-2',
      signInDetails: { loginId: 'new@example.com' },
    });

    act(() => {
      hubCallback?.({ payload: { event: 'signedIn' } });
    });

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(result.current.user).toEqual({ username: 'user-2', email: 'new@example.com' });
  });

  it('signOut calls Amplify signOut and clears the user', async () => {
    vi.mocked(amplifyAuth.getCurrentUser).mockResolvedValue({
      username: 'user-3',
      userId: 'user-3',
      signInDetails: { loginId: 'someone@example.com' },
    });
    vi.mocked(amplifyAuth.signOut).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    expect(amplifyAuth.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
