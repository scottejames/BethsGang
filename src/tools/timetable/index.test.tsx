import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { TimetableProvider } from '../../context/TimetableContext';
import { timetableTool } from './index';

const STORAGE_KEY = 'beths-gang:timetable';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

vi.mock('../../lib/dataClient', () => ({
  client: {
    models: {
      TimetableEntry: {
        observeQuery: vi.fn(() => ({ subscribe: () => ({ unsubscribe: vi.fn() }) })),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

const Component = timetableTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TimetableProvider>{children}</TimetableProvider>
    </AuthProvider>
  );
}

function renderTool() {
  return render(<Component />, { wrapper });
}

function dayColumn(dayLabel: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: dayLabel });
  return heading.closest('div')!.parentElement as HTMLElement;
}

describe('Timetable', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('renders all seven days, empty by default', () => {
    renderTool();
    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunday' })).toBeInTheDocument();
    expect(screen.getAllByText('No lessons yet')).toHaveLength(7);
  });

  it('adds a lesson to the day it was added from', () => {
    renderTool();
    const monday = dayColumn('Monday');

    fireEvent.click(within(monday).getByRole('button', { name: '+ Add lesson' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Maths'), { target: { value: 'Maths' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Room 4B'), { target: { value: 'Room 4B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(within(dayColumn('Monday')).getByText('Maths')).toBeInTheDocument();
    expect(within(dayColumn('Monday')).getByText('Room 4B')).toBeInTheDocument();
    expect(within(dayColumn('Monday')).getByText('1 lesson')).toBeInTheDocument();
  });

  it('editing an existing lesson updates it in place', () => {
    renderTool();
    const monday = dayColumn('Monday');
    fireEvent.click(within(monday).getByRole('button', { name: '+ Add lesson' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Maths'), { target: { value: 'Maths' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    fireEvent.click(within(dayColumn('Monday')).getByText('Maths'));
    expect(screen.getByRole('heading', { name: 'Edit lesson' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. Maths'), { target: { value: 'Further Maths' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(within(dayColumn('Monday')).getByText('Further Maths')).toBeInTheDocument();
    expect(within(dayColumn('Monday')).queryByText('Maths')).not.toBeInTheDocument();
  });

  it('deleting a lesson from the edit modal removes it', () => {
    renderTool();
    const monday = dayColumn('Monday');
    fireEvent.click(within(monday).getByRole('button', { name: '+ Add lesson' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Maths'), { target: { value: 'Maths' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    fireEvent.click(within(dayColumn('Monday')).getByText('Maths'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete lesson' }));

    expect(within(dayColumn('Monday')).getByText('No lessons yet')).toBeInTheDocument();
  });

  it('copying a day replaces the target day\'s lessons with the source day\'s', () => {
    renderTool();
    fireEvent.click(within(dayColumn('Monday')).getByRole('button', { name: '+ Add lesson' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Maths'), { target: { value: 'Maths' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    fireEvent.click(within(dayColumn('Monday')).getByRole('button', { name: 'Copy Monday to other days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    fireEvent.click(screen.getByRole('button', { name: /Copy to 1 day/ }));

    expect(within(dayColumn('Tuesday')).getByText('Maths')).toBeInTheDocument();
  });
});
