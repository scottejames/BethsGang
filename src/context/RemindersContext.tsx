import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RepeatRule } from '../lib/reminderParser';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';

export type { RepeatRule };

export interface Reminder {
  id: string;
  message: string;
  fireAt: string; // ISO timestamp of the next occurrence
  warnBeforeMinutes?: number;
  warnedForCurrentFireAt: boolean; // reset every time fireAt advances
  repeat: RepeatRule;
}

export interface FiredEvent {
  id: string;
  reminderId: string;
  kind: 'warning' | 'due';
  message: string;
  firedAt: string;
}

const STORAGE_KEY = 'beths-gang:reminders';
const MIGRATION_FLAG_KEY = 'beths-gang:reminders-migrated';
const CHECK_INTERVAL_MS = 15_000;

function readStoredReminders(): Reminder[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The backend model stores `repeat` as a JSON string (see amplify/data/resource.ts) —
// these two convert between that and the client-side Reminder shape used everywhere
// else in this file.
function toBackendInput(reminder: Reminder) {
  return {
    id: reminder.id,
    message: reminder.message,
    fireAt: reminder.fireAt,
    warnBeforeMinutes: reminder.warnBeforeMinutes,
    warnedForCurrentFireAt: reminder.warnedForCurrentFireAt,
    repeat: JSON.stringify(reminder.repeat),
  };
}

function fromBackendItem(item: {
  id: string;
  message: string;
  fireAt: string;
  warnBeforeMinutes?: number | null;
  warnedForCurrentFireAt: boolean;
  repeat: string;
}): Reminder {
  let repeat: RepeatRule;
  try {
    repeat = JSON.parse(item.repeat) as RepeatRule;
  } catch {
    repeat = { kind: 'none' };
  }
  return {
    id: item.id,
    message: item.message,
    fireAt: item.fireAt,
    warnBeforeMinutes: item.warnBeforeMinutes ?? undefined,
    warnedForCurrentFireAt: item.warnedForCurrentFireAt,
    repeat,
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Pure so it's directly unit-testable without mocking the whole provider. `daily` and
// `weekdays` advance by calendar days (correct across DST — Date's setDate handles
// that), rather than a fixed millisecond offset like `interval` uses.
export function computeNextOccurrence(fireAt: Date, repeat: RepeatRule): Date {
  switch (repeat.kind) {
    case 'daily':
      return addDays(fireAt, 1);
    case 'weekdays': {
      let next = addDays(fireAt, 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next = addDays(next, 1);
      }
      return next;
    }
    case 'interval': {
      const unitMs = repeat.unit === 'hours' ? 60 * 60 * 1000 : 60 * 1000;
      return new Date(fireAt.getTime() + repeat.amount * unitMs);
    }
    case 'none':
    default:
      return fireAt;
  }
}

export interface AddReminderInput {
  message: string;
  fireAt: Date;
  warnBeforeMinutes?: number;
  repeat: RepeatRule;
}

interface RemindersContextValue {
  reminders: Reminder[];
  firedEvents: FiredEvent[];
  addReminder: (input: AddReminderInput) => void;
  cancelReminder: (id: string) => void;
  dismissEvent: (id: string) => void;
}

const RemindersContext = createContext<RemindersContextValue | null>(null);

function requestNotificationPermissionOnce() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

// Best-effort only — the in-app banner (see AlertBanner.tsx) is the guaranteed
// fallback whether permission was denied, unsupported, or this throws.
function showBrowserNotification(event: FiredEvent) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    const title = event.kind === 'warning' ? `Coming up: ${event.message}` : `Reminder: ${event.message}`;
    new Notification(title);
  } catch {
    // Some browsers throw on `new Notification` even when permission is granted.
  }
}

function makeFiredEvent(reminder: Reminder, kind: FiredEvent['kind']): FiredEvent {
  return {
    id: crypto.randomUUID(),
    reminderId: reminder.id,
    kind,
    message: reminder.message,
    firedAt: new Date().toISOString(),
  };
}

// Lives at the app root (see main.tsx), same pattern as DistractMeProvider/
// EnergyProvider, so reminders keep ticking and firing no matter which tool is open.
export function RemindersProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>(readStoredReminders);
  const [firedEvents, setFiredEvents] = useState<FiredEvent[]>([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;
  const wasSignedIn = useRef(isSignedIn);
  const hasCheckedOnMount = useRef(false);

  // Only mirrors to localStorage while signed out — while signed in, `reminders` is
  // driven by the observeQuery subscription below, and that's account data. It must
  // NOT leak into localStorage, or it would still be visible after signing out (found
  // via direct user testing: a reminder created while signed in was still shown after
  // sign-out, which is wrong for data that belongs to the account, not the device).
  //
  // The sign-out transition itself is handled in the same effect as the write,
  // deliberately not as two separate effects: on the render where `isSignedIn` flips
  // to false, `reminders` in this closure is still the *stale*, still-signed-in value
  // (React doesn't re-run this effect mid-flush after a sibling effect's setState) — a
  // separate "mirror" effect would write that stale account data to localStorage
  // before a separate "revert" effect got a chance to read it back out, defeating the
  // whole point. Handling both in one effect avoids that race entirely.
  useEffect(() => {
    const justSignedOut = wasSignedIn.current && !isSignedIn;
    wasSignedIn.current = isSignedIn;
    if (justSignedOut) {
      const local = readStoredReminders();
      remindersRef.current = local;
      setReminders(local);
      return; // this render's `reminders` is stale account data — don't write it
    }
    if (!isSignedIn) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    }
  }, [reminders, isSignedIn]);

  // Signed in: reminders live in the backend. observeQuery emits the current set
  // immediately, then live updates — this is what makes "added on phone, appears on
  // laptop" work without any manual refetch/polling.
  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.Reminder.observeQuery().subscribe({
      next: ({ items }) => {
        const mapped = items.map(fromBackendItem);
        remindersRef.current = mapped;
        setReminders(mapped);
      },
      error: (error: unknown) => {
        console.error('Reminder subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  // First sign-in on this device only: upload whatever's in localStorage so it isn't
  // stranded there. Silent, no prompt — matches this app's no-login-wall philosophy
  // (see designs/user-personalization.md). Uses each reminder's existing id, so a
  // second run (e.g. Strict Mode, or signing in again later) just fails the duplicate
  // create() harmlessly instead of double-uploading.
  useEffect(() => {
    if (!isSignedIn) return;
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const localReminders = readStoredReminders();
    Promise.all(
      localReminders.map((reminder) =>
        client.models.Reminder.create(toBackendInput(reminder)).catch((error: unknown) => {
          console.error('Failed to migrate local reminder', error);
        }),
      ),
    ).then(() => {
      window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    });
  }, [isSignedIn]);

  // Computes the new reminders array and any newly-fired events as plain values first,
  // then commits them — deliberately not a setState(prev => ...) updater with side
  // effects inside it, since React (Strict Mode) may invoke such updaters twice.
  function checkReminders() {
    const now = Date.now();
    const current = remindersRef.current;
    const newEvents: FiredEvent[] = [];
    let changed = false;
    const next: Reminder[] = [];

    for (const reminder of current) {
      const fireAtMs = new Date(reminder.fireAt).getTime();
      let working = reminder;

      if (
        working.warnBeforeMinutes &&
        !working.warnedForCurrentFireAt &&
        now >= fireAtMs - working.warnBeforeMinutes * 60_000 &&
        now < fireAtMs
      ) {
        newEvents.push(makeFiredEvent(working, 'warning'));
        working = { ...working, warnedForCurrentFireAt: true };
        changed = true;
      }

      if (now >= fireAtMs) {
        newEvents.push(makeFiredEvent(working, 'due'));
        changed = true;
        if (working.repeat.kind === 'none') {
          continue; // one-shot, already fired — drop it
        }
        // Keep advancing until the next occurrence is actually in the future — a
        // reminder missed for several days (app closed, computer asleep) would
        // otherwise only step forward by one occurrence per check here, still land
        // in the past, and fire again on the very next 15-second check (and the one
        // after that) until it's caught up: a burst of duplicate "due" events
        // roughly 15 seconds apart instead of one. One fired event per reminder per
        // check, always, matching how a one-shot reminder's catch-up already works.
        let nextFireAt = computeNextOccurrence(new Date(working.fireAt), working.repeat);
        while (nextFireAt.getTime() <= now) {
          nextFireAt = computeNextOccurrence(nextFireAt, working.repeat);
        }
        working = { ...working, fireAt: nextFireAt.toISOString(), warnedForCurrentFireAt: false };
      }

      next.push(working);
    }

    if (changed) {
      remindersRef.current = next;
      setReminders(next);
      if (isSignedInRef.current) {
        persistReminderChanges(current, next);
      }
    }
    if (newEvents.length > 0) {
      setFiredEvents((currentEvents) => [...currentEvents, ...newEvents]);
      newEvents.forEach(showBrowserNotification);
    }
  }

  // Diffs by id rather than resending everything: a reminder present in `next` but not
  // `current` never happens here (checkReminders only advances/removes, never adds), so
  // this only ever needs to update() a changed reminder or delete() a dropped one.
  function persistReminderChanges(current: Reminder[], next: Reminder[]) {
    const nextById = new Map(next.map((reminder) => [reminder.id, reminder]));
    for (const reminder of current) {
      const updated = nextById.get(reminder.id);
      if (!updated) {
        client.models.Reminder.delete({ id: reminder.id }).catch((error: unknown) => {
          console.error('Failed to delete fired reminder', error);
        });
      } else if (updated !== reminder) {
        client.models.Reminder.update(toBackendInput(updated)).catch((error: unknown) => {
          console.error('Failed to update reminder', error);
        });
      }
    }
  }

  useEffect(() => {
    // Catch-up: a reminder whose fireAt already passed while the tab was closed still
    // surfaces once, instead of being silently lost. Guarded by a ref (not state) so
    // Strict Mode's mount→cleanup→mount dev cycle can't run this catch-up check twice.
    if (!hasCheckedOnMount.current) {
      hasCheckedOnMount.current = true;
      checkReminders();
    }
    const id = window.setInterval(checkReminders, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addReminder(input: AddReminderInput) {
    requestNotificationPermissionOnce();
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      message: input.message,
      fireAt: input.fireAt.toISOString(),
      warnBeforeMinutes: input.warnBeforeMinutes,
      warnedForCurrentFireAt: false,
      repeat: input.repeat,
    };
    // Optimistic — state updates immediately either way, same feel as before this
    // context talked to a backend. When signed in, the next observeQuery emission
    // reconciles this against whatever the backend actually stored.
    setReminders((currentReminders) => [...currentReminders, reminder]);
    if (isSignedInRef.current) {
      client.models.Reminder.create(toBackendInput(reminder)).catch((error: unknown) => {
        console.error('Failed to create reminder', error);
      });
    }
  }

  function cancelReminder(id: string) {
    setReminders((currentReminders) => currentReminders.filter((reminder) => reminder.id !== id));
    if (isSignedInRef.current) {
      client.models.Reminder.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete reminder', error);
      });
    }
  }

  function dismissEvent(id: string) {
    setFiredEvents((currentEvents) => currentEvents.filter((event) => event.id !== id));
  }

  return (
    <RemindersContext.Provider value={{ reminders, firedEvents, addReminder, cancelReminder, dismissEvent }}>
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders(): RemindersContextValue {
  const context = useContext(RemindersContext);
  if (!context) {
    throw new Error('useReminders must be used within a RemindersProvider');
  }
  return context;
}
