import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { TaskStoreProvider, useTaskStore } from '../../context/TaskStoreContext';
import { sideQuestLogTool } from './index';

// TaskStoreContext now reads sign-in state — every test in this file runs signed
// out, exercising the same localStorage-backed path as before that change.
vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const Component = sideQuestLogTool.Component;
const STORAGE_KEY = 'beths-gang:sidequest-log';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TaskStoreProvider>{children}</TaskStoreProvider>
    </AuthProvider>
  );
}

// Exposes TaskStoreContext state so "did promoting an entry actually create a task"
// is observable — same technique as taskBreakdown/index.test.tsx's Spy.
function TaskSpy() {
  const { tasks } = useTaskStore();
  return (
    <ul data-testid="task-spy">
      {tasks.map((task) => (
        <li key={task.id}>
          {task.title}|{task.projectId ?? 'none'}|{task.size}|{task.category}
        </li>
      ))}
    </ul>
  );
}

function renderTool() {
  return render(
    <>
      <Component />
      <TaskSpy />
    </>,
    { wrapper },
  );
}

function logEntry(text: string) {
  fireEvent.change(screen.getByLabelText('New side quest'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
}

describe('SideQuestLog', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
  });

  it('shows an empty state with nothing logged', () => {
    renderTool();
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument();
  });

  it('logs a new entry and persists it to localStorage', () => {
    renderTool();
    logEntry('did I lock the door?');

    expect(screen.getByText('did I lock the door?')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored.some((entry: { text: string }) => entry.text === 'did I lock the door?')).toBe(true);
  });

  it('shows the newest entry first', () => {
    renderTool();
    logEntry('first thought');
    logEntry('second thought');

    const items = screen.getAllByRole('listitem').map((item) => item.querySelector('.sidequest-item-text')?.textContent);
    expect(items).toEqual(['second thought', 'first thought']);
  });

  it('marking an entry Done removes it without creating a task', () => {
    renderTool();
    logEntry('email the accountant');

    fireEvent.click(screen.getByLabelText('Mark "email the accountant" done'));

    expect(screen.queryByText('email the accountant')).not.toBeInTheDocument();
    expect(screen.getByTestId('task-spy').textContent).toBe('');
  });

  it('binning an entry removes it without creating a task', () => {
    renderTool();
    logEntry('worry about nothing');

    fireEvent.click(screen.getByLabelText('Bin "worry about nothing"'));

    expect(screen.queryByText('worry about nothing')).not.toBeInTheDocument();
    expect(screen.getByTestId('task-spy').textContent).toBe('');
  });

  it('turning an entry into a task promotes it into the Shared Task Store, project-less, small and later', () => {
    renderTool();
    logEntry('renew car insurance');

    fireEvent.click(screen.getByLabelText('Turn "renew car insurance" into a task'));

    expect(screen.queryByText('renew car insurance')).not.toBeInTheDocument();
    expect(screen.getByTestId('task-spy').textContent).toContain('renew car insurance|none|small|later');
  });
});
