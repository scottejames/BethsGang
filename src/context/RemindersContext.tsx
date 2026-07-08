import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RepeatRule } from '../lib/reminderParser';

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

// Best-effort only — the in-app banner (see ReminderBanner.tsx) is the guaranteed
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
  const [reminders, setReminders] = useState<Reminder[]>(readStoredReminders);
  const [firedEvents, setFiredEvents] = useState<FiredEvent[]>([]);
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const hasCheckedOnMount = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  }, [reminders]);

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
        const nextFireAt = computeNextOccurrence(new Date(working.fireAt), working.repeat);
        working = { ...working, fireAt: nextFireAt.toISOString(), warnedForCurrentFireAt: false };
      }

      next.push(working);
    }

    if (changed) {
      remindersRef.current = next;
      setReminders(next);
    }
    if (newEvents.length > 0) {
      setFiredEvents((currentEvents) => [...currentEvents, ...newEvents]);
      newEvents.forEach(showBrowserNotification);
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
    setReminders((currentReminders) => [...currentReminders, reminder]);
  }

  function cancelReminder(id: string) {
    setReminders((currentReminders) => currentReminders.filter((reminder) => reminder.id !== id));
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
