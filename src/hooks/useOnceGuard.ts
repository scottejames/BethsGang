import { useRef } from 'react';

// Guards against a fast double-click firing a handler twice — a ref (checked-and-set
// synchronously), not state, since two click handlers dispatched back-to-back can both
// run before React re-renders with a disabled button, and a state check would still see
// the stale pre-click value in that case. For guarding one whole batch/submission at a
// time (reset before the next one starts) — a tool guarding N independent items instead
// (e.g. Side Quest Log's per-entry promotion) needs its own Set-based guard, not this.
export function useOnceGuard() {
  const firedRef = useRef(false);
  return {
    hasFired: () => firedRef.current,
    markFired: () => {
      firedRef.current = true;
    },
    reset: () => {
      firedRef.current = false;
    },
  };
}
