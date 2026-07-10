import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_WINDOW_MS = 5000;

export interface PendingDelete<T> {
  id: string;
  item: T;
  label: string;
}

// Optimistic "soft delete": the item disappears from the list immediately (check
// `isPending(id)` in the caller's render to filter it out), but the actual delete
// (`commitDelete`) only runs after a short grace window — long enough for an "Undo"
// click to cancel it first. Used for anything that's genuinely destructive with no
// existing safety net (see Everything Pile's task delete vs. its project delete,
// which already detaches rather than destroys tasks).
export function useUndoableDelete<T>(commitDelete: (item: T) => void) {
  const [pending, setPending] = useState<PendingDelete<T>[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const commitDeleteRef = useRef(commitDelete);
  commitDeleteRef.current = commitDelete;

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const requestDelete = useCallback((id: string, item: T, label: string) => {
    setPending((current) => [...current, { id, item, label }]);
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(id);
      setPending((current) => current.filter((entry) => entry.id !== id));
      commitDeleteRef.current(item);
    }, UNDO_WINDOW_MS);
    timersRef.current.set(id, timerId);
  }, []);

  const undo = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setPending((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const isPending = useCallback((id: string) => pending.some((entry) => entry.id === id), [pending]);

  return { pending, requestDelete, undo, isPending };
}
