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
import { essayStructurePlannerTool } from './index';

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

const Component = essayStructurePlannerTool.Component;

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

function fillForm(title: string, description: string) {
  fireEvent.change(screen.getByPlaceholderText('e.g. The Causes of WWI'), { target: { value: title } });
  fireEvent.change(screen.getByPlaceholderText(/a short description of the assignment/i), {
    target: { value: description },
  });
}

describe('EssayStructurePlanner', () => {
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

  it('disables submit until both fields have content', () => {
    renderTool();
    const submit = screen.getByRole('button', { name: 'Suggest a structure' });
    expect(submit).toBeDisabled();

    fillForm('The Causes of WWI', '2000 words, focus on alliance systems.');
    expect(submit).not.toBeDisabled();
  });

  it('renders the returned headings with numbering stripped', async () => {
    vi.mocked(runAiTool).mockResolvedValue(
      '1. Alliance systems — how they escalated the conflict.\n2. The assassination of Franz Ferdinand — the immediate trigger.',
    );
    renderTool();

    fillForm('The Causes of WWI', '2000 words, focus on alliance systems.');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a structure' }));

    await screen.findByText('Alliance systems — how they escalated the conflict.');
    expect(screen.getByText('The assassination of Franz Ferdinand — the immediate trigger.')).toBeInTheDocument();
  });

  it('sends the current structure and feedback on an update, then clears the feedback field', async () => {
    vi.mocked(runAiTool)
      .mockResolvedValueOnce('1. Alliance systems — how they escalated the conflict.')
      .mockResolvedValueOnce('1. The assassination of Franz Ferdinand — the immediate trigger.');
    renderTool();

    fillForm('The Causes of WWI', '2000 words, focus on alliance systems.');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a structure' }));
    await screen.findByText('Alliance systems — how they escalated the conflict.');

    fireEvent.change(screen.getByPlaceholderText(/want to adjust the structure/i), {
      target: { value: 'Add a section on the assassination.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update structure with feedback' }));

    await screen.findByText('The assassination of Franz Ferdinand — the immediate trigger.');

    const [, secondEnvelope] = vi.mocked(runAiTool).mock.calls[1];
    const { input } = JSON.parse(secondEnvelope);
    const payload = JSON.parse(input);
    expect(payload.currentStructure).toBe('1. Alliance systems — how they escalated the conflict.');
    expect(payload.feedback).toBe('Add a section on the assassination.');
    expect(screen.getByPlaceholderText(/want to adjust the structure/i)).toHaveValue('');
  });

  it('sending to Everything Pile creates a project named after the title, holding the headings as tasks', async () => {
    vi.mocked(runAiTool).mockResolvedValue(
      '1. Alliance systems — how they escalated the conflict.\n2. The assassination of Franz Ferdinand — the immediate trigger.',
    );
    renderTool();

    fillForm('The Causes of WWI', '2000 words, focus on alliance systems.');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a structure' }));
    await screen.findByText('Alliance systems — how they escalated the conflict.');

    fireEvent.click(screen.getByRole('button', { name: 'Send "The Causes of WWI" to Everything Pile' }));

    await waitFor(() => expect(screen.getByTestId('active-tool-id')).toHaveTextContent('everything-pile'));
    expect(screen.getByTestId('project-list')).toHaveTextContent('The Causes of WWI');
    const taskList = screen.getByTestId('task-list').textContent ?? '';
    expect(taskList).toContain('Alliance systems — how they escalated the conflict.|');
    expect(taskList).toContain('The assassination of Franz Ferdinand — the immediate trigger.|');
    expect(taskList).toContain('|small|now');
  });
});
