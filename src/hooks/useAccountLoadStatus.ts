import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportSyncFailure } from '../lib/saveFailures';

export type LoadStatus = 'loading' | 'loaded' | 'failed';

type SourceState = 'empty' | 'hasData' | 'failed';

// Amplify's observeQuery reports nothing if its first fetch hits a network failure, so
// without a limit a screen could say "Loading…" forever.
export const LOAD_TIMEOUT_MS = 30_000;

// Tracks whether a signed-in person's account data has arrived, so a screen never claims
// "nothing here" while it's still on its way. `sources` is every observeQuery feeding it.
// Signed-out data lives on the device, so it counts as loaded once the sign-in check ends.
export function useAccountLoadStatus(sources: readonly string[]) {
  const { isSignedIn, loading: authLoading } = useAuth();
  const [states, setStates] = useState<Record<string, SourceState>>({});

  useEffect(() => {
    if (!isSignedIn) setStates({});
  }, [isSignedIn]);

  const markArrived = useCallback((source: string, itemCount: number) => {
    setStates((current) => ({ ...current, [source]: itemCount > 0 ? 'hasData' : 'empty' }));
  }, []);

  // A failed first fetch still emits an empty list just before its error, so only data
  // that actually arrived survives a failure. Then the list stays up beside the warning.
  const markFailed = useCallback((source: string) => {
    setStates((current) => (current[source] === 'hasData' ? current : { ...current, [source]: 'failed' }));
  }, []);

  let status: LoadStatus = 'loading';
  if (!authLoading) {
    if (!isSignedIn || sources.every((source) => states[source] && states[source] !== 'failed')) status = 'loaded';
    else if (sources.some((source) => states[source] === 'failed')) status = 'failed';
  }

  const waitingForAccount = status === 'loading' && !authLoading;

  useEffect(() => {
    if (!waitingForAccount) return;
    const timeout = window.setTimeout(() => {
      setStates((current) =>
        Object.fromEntries(sources.map((source) => [source, current[source] ?? 'failed'])),
      );
      reportSyncFailure('Timed out loading account data', sources);
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [waitingForAccount, sources]);

  return { status, markArrived, markFailed };
}
