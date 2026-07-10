import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { client } from '../lib/dataClient';

// Monday-first order, matching how a school week is actually laid out — used both as
// the canonical iteration order for rendering and as the source of truth for
// dayKeyForDate()'s JS-Sunday-first -> Monday-first remap.
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayOfWeek = (typeof DAYS)[number];

export interface TimetableEntry {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  endTime?: string; // "HH:mm" — display only, the alert only ever needs startTime
  label: string;
  location?: string;
  alertMinutesBefore?: number; // unset means "use the default" (see DEFAULT_ALERT_MINUTES)
}

export interface TimetableAlert {
  id: string;
  entryId: string;
  text: string;
}

export interface TimetableEntryInput {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime?: string;
  label: string;
  location?: string;
  alertMinutesBefore?: number;
}

const STORAGE_KEY = 'beths-gang:timetable';
const MIGRATION_FLAG_KEY = 'beths-gang:timetable-migrated';
// Coarser than Reminders' 15s — a 15-minute alert window doesn't need to-the-second
// precision the way a reminder's exact fireAt does.
const CHECK_INTERVAL_MS = 30_000;
const DEFAULT_ALERT_MINUTES = 15;

function readStoredEntries(): TimetableEntry[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// AWSTime (the backend scalar) requires seconds; this app's UI only ever deals in
// "HH:mm". These two convert between them, the same shape as Reminder.repeat's
// JSON-string conversion — an evolving/foreign-format field converted at the
// context boundary, not leaked into the rest of the app.
function toBackendTime(time: string): string {
  return `${time}:00`;
}

function fromBackendTime(time: string): string {
  return time.slice(0, 5);
}

function toBackendInput(entry: TimetableEntry) {
  return {
    id: entry.id,
    dayOfWeek: entry.dayOfWeek,
    startTime: toBackendTime(entry.startTime),
    endTime: entry.endTime ? toBackendTime(entry.endTime) : null,
    label: entry.label,
    location: entry.location ?? null,
    alertMinutesBefore: entry.alertMinutesBefore ?? null,
  };
}

function fromBackendItem(item: {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime?: string | null;
  label: string;
  location?: string | null;
  alertMinutesBefore?: number | null;
}): TimetableEntry {
  return {
    id: item.id,
    dayOfWeek: item.dayOfWeek as DayOfWeek,
    startTime: fromBackendTime(item.startTime),
    endTime: item.endTime ? fromBackendTime(item.endTime) : undefined,
    label: item.label,
    location: item.location ?? undefined,
    alertMinutesBefore: item.alertMinutesBefore ?? undefined,
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// getDay(): 0 = Sunday .. 6 = Saturday. Rotated so Monday lands at index 0, matching
// DAYS above.
function dayKeyForDate(date: Date): DayOfWeek {
  return DAYS[(date.getDay() + 6) % 7];
}

function dateStamp(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

interface TimetableContextValue {
  entries: TimetableEntry[];
  alerts: TimetableAlert[];
  addEntry: (input: TimetableEntryInput) => void;
  updateEntry: (id: string, input: TimetableEntryInput) => void;
  deleteEntry: (id: string) => void;
  copyDay: (sourceDay: DayOfWeek, targetDays: DayOfWeek[]) => void;
  dismissAlert: (id: string) => void;
}

const TimetableContext = createContext<TimetableContextValue | null>(null);

// Lives at the app root (see main.tsx), same persistent-provider pattern as
// RemindersContext, so lesson alerts keep firing no matter which tool is open.
export function TimetableProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [entries, setEntries] = useState<TimetableEntry[]>(readStoredEntries);
  const [alerts, setAlerts] = useState<TimetableAlert[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;
  const wasSignedIn = useRef(isSignedIn);
  const hasCheckedOnMount = useRef(false);
  // Which entry+day combinations have already alerted — in-memory only, not
  // persisted. Naturally "resets" every day since the date is part of the key, the
  // same way a weekly-recurring entry needs no explicit reschedule step at all. Losing
  // this on a hard refresh risks one possible duplicate alert at worst, a much smaller
  // cost than Reminder.warnedForCurrentFireAt needing to survive reload for a one-shot
  // reminder that would otherwise never fire its warning again.
  const firedToday = useRef<Record<string, true>>({});

  // Same signed-out-mirror / signed-out-revert shape as RemindersContext.tsx — see its
  // comment on the equivalent effect for the exact race this single-effect handling
  // avoids.
  useEffect(() => {
    const justSignedOut = wasSignedIn.current && !isSignedIn;
    wasSignedIn.current = isSignedIn;
    if (justSignedOut) {
      const local = readStoredEntries();
      entriesRef.current = local;
      setEntries(local);
      return;
    }
    if (!isSignedIn) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  }, [entries, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    const subscription = client.models.TimetableEntry.observeQuery().subscribe({
      next: ({ items }) => {
        const mapped = items.map(fromBackendItem);
        entriesRef.current = mapped;
        setEntries(mapped);
      },
      error: (error: unknown) => {
        console.error('TimetableEntry subscription error', error);
      },
    });
    return () => subscription.unsubscribe();
  }, [isSignedIn]);

  // First sign-in on this device only — same silent migration as every other
  // localStorage-backed context.
  useEffect(() => {
    if (!isSignedIn) return;
    if (window.localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    const localEntries = readStoredEntries();
    Promise.all(
      localEntries.map((entry) =>
        client.models.TimetableEntry.create(toBackendInput(entry)).catch((error: unknown) => {
          console.error('Failed to migrate local timetable entry', error);
        }),
      ),
    ).then(() => {
      window.localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    });
  }, [isSignedIn]);

  // Computes any newly-fired alerts as a plain array first, then commits — same
  // discipline as RemindersContext.checkReminders(), for the same reason (no side
  // effects inside a setState updater). The window check (`nowMinutes < startMinutes`)
  // is also what makes catch-up-on-mount below safe: an entry whose start time has
  // already passed is never "caught up" on, only one still genuinely upcoming is.
  function checkAlerts() {
    const now = new Date();
    const today = dayKeyForDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const stamp = dateStamp(now);
    const newAlerts: TimetableAlert[] = [];

    for (const entry of entriesRef.current) {
      if (entry.dayOfWeek !== today) continue;
      const startMinutes = timeToMinutes(entry.startTime);
      const lead = entry.alertMinutesBefore ?? DEFAULT_ALERT_MINUTES;
      const alertAtMinutes = startMinutes - lead;
      const key = `${entry.id}|${stamp}`;
      const inWindow = nowMinutes >= alertAtMinutes && nowMinutes < startMinutes;
      if (inWindow && !firedToday.current[key]) {
        firedToday.current[key] = true;
        const minutesLeft = startMinutes - nowMinutes;
        newAlerts.push({
          id: crypto.randomUUID(),
          entryId: entry.id,
          text: `${entry.label} starts in ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'}${entry.location ? ` — ${entry.location}` : ''}`,
        });
      }
    }

    if (newAlerts.length > 0) {
      setAlerts((current) => [...current, ...newAlerts]);
    }
  }

  useEffect(() => {
    // Catch-up: an entry already inside its alert window when the tab opens still
    // surfaces once. Guarded by a ref (not state) so Strict Mode's mount→cleanup→mount
    // dev cycle can't run this twice — same as RemindersContext's equivalent guard.
    if (!hasCheckedOnMount.current) {
      hasCheckedOnMount.current = true;
      checkAlerts();
    }
    const id = window.setInterval(checkAlerts, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addEntry(input: TimetableEntryInput) {
    const entry: TimetableEntry = { id: crypto.randomUUID(), ...input };
    setEntries((current) => [...current, entry]);
    if (isSignedInRef.current) {
      client.models.TimetableEntry.create(toBackendInput(entry)).catch((error: unknown) => {
        console.error('Failed to create timetable entry', error);
      });
    }
  }

  function updateEntry(id: string, input: TimetableEntryInput) {
    const entry: TimetableEntry = { id, ...input };
    setEntries((current) => current.map((existing) => (existing.id === id ? entry : existing)));
    if (isSignedInRef.current) {
      client.models.TimetableEntry.update(toBackendInput(entry)).catch((error: unknown) => {
        console.error('Failed to update timetable entry', error);
      });
    }
  }

  function deleteEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (isSignedInRef.current) {
      client.models.TimetableEntry.delete({ id }).catch((error: unknown) => {
        console.error('Failed to delete timetable entry', error);
      });
    }
  }

  // Replaces each target day's lessons with a copy of the source day's — not a merge,
  // since "copy Monday to Tuesday" is meant to set Tuesday's shape, not pile
  // duplicates on top of whatever was already there.
  function copyDay(sourceDay: DayOfWeek, targetDays: DayOfWeek[]) {
    const current = entriesRef.current;
    const sourceEntries = current.filter((entry) => entry.dayOfWeek === sourceDay);
    const targetDaySet = new Set(targetDays);
    const removed = current.filter((entry) => targetDaySet.has(entry.dayOfWeek));
    const remaining = current.filter((entry) => !targetDaySet.has(entry.dayOfWeek));
    const additions: TimetableEntry[] = [];
    targetDays.forEach((day) => {
      sourceEntries.forEach((entry) => {
        additions.push({ ...entry, id: crypto.randomUUID(), dayOfWeek: day });
      });
    });

    setEntries([...remaining, ...additions]);
    if (isSignedInRef.current) {
      removed.forEach((entry) => {
        client.models.TimetableEntry.delete({ id: entry.id }).catch((error: unknown) => {
          console.error('Failed to delete timetable entry during copy', error);
        });
      });
      additions.forEach((entry) => {
        client.models.TimetableEntry.create(toBackendInput(entry)).catch((error: unknown) => {
          console.error('Failed to create timetable entry during copy', error);
        });
      });
    }
  }

  function dismissAlert(id: string) {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }

  return (
    <TimetableContext.Provider
      value={{ entries, alerts, addEntry, updateEntry, deleteEntry, copyDay, dismissAlert }}
    >
      {children}
    </TimetableContext.Provider>
  );
}

export function useTimetable(): TimetableContextValue {
  const context = useContext(TimetableContext);
  if (!context) {
    throw new Error('useTimetable must be used within a TimetableProvider');
  }
  return context;
}
