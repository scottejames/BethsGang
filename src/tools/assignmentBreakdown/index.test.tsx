import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { EnergyProvider } from '../../context/EnergyContext';
import { TaskStoreProvider, useTaskStore } from '../../context/TaskStoreContext';
import { ToolNavigationProvider, useToolNavigation } from '../../context/ToolNavigationContext';
import { runAiTool } from '../../lib/aiClient';
import { assignmentBreakdownTool } from './index';

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

const Component = assignmentBreakdownTool.Component;

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

// Same technique as taskBreakdown/index.test.tsx's Spy — this app has no router, so
// "did it navigate / did the right project get the tasks" has no visible trace inside
// AssignmentBreakdown's own render.
function Spy() {
  const { projects, tasks } = useTaskStore();
  const { activeToolId } = useToolNavigation();
  return (
    <div data-testid="spy">
      <span data-testid="active-tool-id">{activeToolId ?? ''}</span>
      <ul data-testid="project-list">
        {projects.map((project) => (
          <li key={project.id}>{project.name}</li>
        ))}
      </ul>
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

function renderTool() {
  return render(
    <>
      <Component />
      <Spy />
    </>,
    { wrapper },
  );
}

function fillForm(name: string, instructions: string) {
  fireEvent.change(screen.getByPlaceholderText('e.g. Essay: The Causes of WWI'), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText(/paste the assignment instructions/i), {
    target: { value: instructions },
  });
}

describe('AssignmentBreakdown', () => {
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

  it('disables the submit button until both fields have content', () => {
    renderTool();
    const submit = screen.getByRole('button', { name: 'Break it down' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Essay: The Causes of WWI'), {
      target: { value: 'Essay: The Causes of WWI' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/paste the assignment instructions/i), {
      target: { value: '2000 words, due Friday.' },
    });
    expect(submit).not.toBeDisabled();
  });

  it('renders the returned steps with numbering stripped', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Read the brief\n2. Draft an outline');
    renderTool();

    fillForm('Essay: The Causes of WWI', '2000 words, due Friday.');
    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));

    await screen.findByText('Read the brief');
    expect(screen.getByText('Draft an outline')).toBeInTheDocument();
  });

  it('sends the assignment name and instructions to the AI tool', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Read the brief');
    renderTool();

    fillForm('Essay: The Causes of WWI', '2000 words, due Friday.');
    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));
    await screen.findByText('Read the brief');

    const [, envelope] = vi.mocked(runAiTool).mock.calls[0];
    const { input } = JSON.parse(envelope);
    const payload = JSON.parse(input);
    expect(payload).toEqual({
      assignmentName: 'Essay: The Causes of WWI',
      instructions: '2000 words, due Friday.',
    });
  });

  it('sending to Everything Pile creates a new project named after the assignment, holding the steps', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Read the brief\n2. Draft an outline');
    renderTool();

    fillForm('Essay: The Causes of WWI', '2000 words, due Friday.');
    fireEvent.click(screen.getByRole('button', { name: 'Break it down' }));
    await screen.findByText('Read the brief');

    const sendButton = screen.getByRole('button', { name: 'Send "Essay: The Causes of WWI" to Everything Pile' });
    fireEvent.click(sendButton);

    await waitFor(() => expect(screen.getByTestId('active-tool-id')).toHaveTextContent('everything-pile'));
    expect(screen.getByTestId('project-list')).toHaveTextContent('Essay: The Causes of WWI');
    const taskList = screen.getByTestId('task-list').textContent ?? '';
    expect(taskList).toContain('Read the brief|');
    expect(taskList).toContain('Draft an outline|');
    expect(taskList).toContain('|small|now');
  });
});
