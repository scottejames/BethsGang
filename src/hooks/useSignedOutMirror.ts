import { useEffect, useRef } from 'react';

// Mirrors `value` to localStorage while signed out — the full offline/local experience
// for anyone not signed in — and reverts to whatever's stored locally the moment the
// user signs out, since account data must not linger in localStorage after sign-out
// (found via direct user testing on RemindersContext: a reminder created while signed
// in was still shown after sign-out, which is wrong for data that belongs to the
// account, not the device).
//
// The sign-out transition and the mirror-write are handled in one effect, deliberately
// not two: on the render where `isSignedIn` flips to false, `value` in this closure is
// still the stale, still-signed-in value (React doesn't re-run this effect mid-flush
// after a sibling effect's setState) — a separate "mirror" effect would write that
// stale account data to localStorage before a separate "revert" effect got a chance to
// read it back out, defeating the whole point. One effect avoids that race entirely.
export function useSignedOutMirror<T>(
  value: T,
  isSignedIn: boolean,
  storageKey: string,
  readStoredValue: () => T,
  onRevert: (value: T) => void,
): void {
  const wasSignedIn = useRef(isSignedIn);

  useEffect(() => {
    const justSignedOut = wasSignedIn.current && !isSignedIn;
    wasSignedIn.current = isSignedIn;
    if (justSignedOut) {
      onRevert(readStoredValue());
      return; // this render's `value` is stale account data — don't write it
    }
    if (!isSignedIn) {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isSignedIn]);
}
