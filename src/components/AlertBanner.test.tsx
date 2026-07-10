import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AlertBanner } from './AlertBanner';
import { AuthProvider } from '../context/AuthContext';
import { RemindersProvider, useReminders } from '../context/RemindersContext';
import { TimetableProvider, useTimetable } from '../context/TimetableContext';

const REMINDERS_KEY = 'beths-gang:reminders';
const TIMETABLE_KEY = 'beths-gang:timetable';

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
      Reminder: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      TimetableEntry: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

// Seeds one fired reminder event and one timetable alert directly through each
// context's own hook, then renders AlertBanner alongside — proving the two
// independent contexts really do merge into one displayed stack, not just that each
// renders correctly in isolation.
function Seeder() {
  const { addReminder } = useReminders();
  const { addEntry } = useTimetable();

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          addReminder({ message: 'stretch', fireAt: new Date(Date.now() - 1000), repeat: { kind: 'none' } })
        }
      >
        seed-reminder
      </button>
      <button
        type="button"
        onClick={() => addEntry({ dayOfWeek: 'monday', startTime: '09:00', label: 'Maths', location: 'Room 4B' })}
      >
        seed-timetable
      </button>
    </div>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RemindersProvider>
        <TimetableProvider>{children}</TimetableProvider>
      </RemindersProvider>
    </AuthProvider>
  );
}

describe('AlertBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.removeItem(REMINDERS_KEY);
    window.localStorage.removeItem(TIMETABLE_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    window.localStorage.removeItem(REMINDERS_KEY);
    window.localStorage.removeItem(TIMETABLE_KEY);
  });

  it('renders nothing when neither Reminders nor Timetable have anything fired', () => {
    render(
      <>
        <AlertBanner />
      </>,
      { wrapper },
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('merges a fired reminder and a lesson alert into one stack, each dismissible independently', async () => {
    vi.setSystemTime(new Date('2026-07-13T08:50:00')); // Monday, 10 min before the seeded 09:00 lesson

    render(
      <>
        <Seeder />
        <AlertBanner />
      </>,
      { wrapper },
    );

    fireEvent.click(screen.getByText('seed-reminder'));
    // Reminder fires on RemindersContext's next 15s tick (fake timers — advance
    // explicitly rather than waitFor, which polls on a real clock).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(screen.getByText(/Reminder: stretch/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('seed-timetable'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000); // Timetable's 30s tick
    });
    expect(screen.getByText(/Maths starts in 10 minutes — Room 4B/)).toBeInTheDocument();

    expect(screen.getAllByRole('status')).toHaveLength(2);

    // Dismiss just the reminder — the lesson alert stays.
    const reminderItem = screen.getByText(/Reminder: stretch/).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(reminderItem).getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(/Reminder: stretch/)).not.toBeInTheDocument();
    expect(screen.getByText(/Maths starts in 10 minutes/)).toBeInTheDocument();
  });
});
