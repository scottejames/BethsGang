import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { EnergyProvider } from '../../context/EnergyContext';
import { TaskStoreProvider, useTaskStore } from '../../context/TaskStoreContext';
import { ToolNavigationProvider, useToolNavigation } from '../../context/ToolNavigationContext';
import type { TaskBreakdownRequest } from '../../context/ToolNavigationContext';
import { runAiTool } from '../../lib/aiClient';
import { taskBreakdownTool } from './index';

vi.mock('../../hooks/useUsageLog', () => ({
  useUsageLog: () => vi.fn(),
}));

vi.mock('../../lib/aiClient', () => ({
  runAiTool: vi.fn(),
}));

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const Component = taskBreakdownTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <TaskStoreProvider>
          <ToolNavigationProvider>{children}</ToolNavigationProvider>
        </TaskStoreProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}

// Exposes TaskStoreContext/ToolNavigationContext state for assertions — this app has
// no router, so "did it navigate / did the right project get the tasks" has no visible
// trace inside TaskBreakdown's own render. Same technique as
// parkMySidequest/index.test.tsx's NavigationSpy.
function Spy() {
  const { projects, tasks } = useTaskStore();
  const { activeToolId } = useToolNavigation();
  return (
    <div data-testid="spy">
      <span data-testid="active-tool-id">{activeToolId ?? ''}</span>
      <span data-testid="project-count">{projects.length}</span>
      <ul data-testid="task-list">
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title}|{task.projectId ?? 'none'}|{task.size}|{task.category}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Seeds ToolNavigationContext's pendingBreakdownRequest before TaskBreakdown itself
// ever mounts, simulating arriving via Sidequest's "Break down" button. Rendered first,
// then swapped for the real component via rerender() — same provider tree/state
// throughout, so the seeded value is there when TaskBreakdown's own mount effect reads it.
function Seeder({ request }: { request: TaskBreakdownRequest }) {
  const { requestTaskBreakdown } = useToolNavigation();
  useEffect(() => {
    requestTaskBreakdown(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderTool() {
  return render(
    <>
      <Component />
      <Spy />
    </>,
    { wrapper },
  );
}

function renderToolWithHandoff(request: TaskBreakdownRequest) {
  const utils = render(<Seeder request={request} />, { wrapper });
  utils.rerender(
    <>
      <Component />
      <Spy />
    </>,
  );
  return utils;
}

describe('TaskBreakdown', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    window.localStorage.removeItem('beths-gang:energy-spoons');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(runAiTool).mockReset();
  });

  afterEach(() => {
    window.localStorage.removeItem('beths-gang:projects');
    window.localStorage.removeItem('beths-gang:tasks');
    window.localStorage.removeItem('beths-gang:energy-spoons');
  });

  it('renders the returned steps with numbering stripped', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Buy tape\n2. Buy tile spacers');
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. Sort out my taxes'), {
      target: { value: 'Grout the kitchen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));

    await screen.findByText('Buy tape');
    expect(screen.getByText('Buy tile spacers')).toBeInTheDocument();
  });

  it('a standalone breakdown, sent to Sidequest, creates a new project holding the steps', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Buy tape\n2. Buy tile spacers');
    renderTool();

    fireEvent.change(screen.getByPlaceholderText('e.g. Sort out my taxes'), {
      target: { value: 'Grout the kitchen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));
    await screen.findByText('Buy tape');

    expect(screen.getByRole('button', { name: 'Send to Sidequest' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Sidequest' }));

    await waitFor(() => expect(screen.getByTestId('project-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('active-tool-id')).toHaveTextContent('park-my-sidequest');
    const taskList = screen.getByTestId('task-list').textContent ?? '';
    expect(taskList).toContain('Buy tape|');
    expect(taskList).toContain('Buy tile spacers|');
    expect(taskList).toContain('|small|now');
  });

  it('pre-fills from a Sidequest handoff and sends steps back into that same project (no new one)', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Buy tape\n2. Buy tile spacers');
    renderToolWithHandoff({ projectId: 'existing-id', projectName: 'Kitchen reno', prefillText: 'Kitchen reno' });

    expect(screen.getByPlaceholderText('e.g. Sort out my taxes')).toHaveValue('Kitchen reno');

    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));
    await screen.findByText('Buy tape');

    const sendButton = screen.getByRole('button', { name: 'Add to "Kitchen reno"' });
    expect(screen.queryByRole('button', { name: 'Send to Sidequest' })).not.toBeInTheDocument();
    fireEvent.click(sendButton);

    await waitFor(() => expect(screen.getByTestId('active-tool-id')).toHaveTextContent('park-my-sidequest'));
    // No new Project record — the handoff's origin project is assumed to already exist
    // in Sidequest (this test never created one via addProject).
    expect(screen.getByTestId('project-count')).toHaveTextContent('0');
    const taskList = screen.getByTestId('task-list').textContent ?? '';
    expect(taskList).toContain('Buy tape|existing-id|small|now');
    expect(taskList).toContain('Buy tile spacers|existing-id|small|now');
  });
});
