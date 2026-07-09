import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { EnergyProvider } from '../../context/EnergyContext';
import { TaskStoreProvider, useTaskStore } from '../../context/TaskStoreContext';
import { runAiTool } from '../../lib/aiClient';
import { brainDumpSorterTool } from './index';

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

const Component = brainDumpSorterTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <TaskStoreProvider>{children}</TaskStoreProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}

// Exposes TaskStoreContext state so "did sending actually create the right tasks" is
// observable — same technique as taskBreakdown/index.test.tsx's Spy.
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

function typeAndSort(text: string) {
  fireEvent.change(screen.getByPlaceholderText("What's on your mind?"), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Sort it out' }));
}

describe('BrainDumpSorter', () => {
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

  it('extracts tasks from the brain dump, all included by default', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Email the landlord\n2. Buy dog food');
    renderTool();

    typeAndSort('need to email the landlord about the leak and also we are out of dog food ugh');

    await screen.findByDisplayValue('Email the landlord');
    expect(screen.getByDisplayValue('Buy dog food')).toBeInTheDocument();
    expect(screen.getByLabelText('Include "Email the landlord"')).toBeChecked();
    expect(screen.getByLabelText('Include "Buy dog food"')).toBeChecked();
  });

  it('sends only the included tasks, project-less, small and later', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Email the landlord\n2. Buy dog food');
    renderTool();
    typeAndSort('brain dump text');
    await screen.findByDisplayValue('Email the landlord');

    fireEvent.click(screen.getByLabelText('Include "Buy dog food"'));
    fireEvent.click(screen.getByRole('button', { name: 'Send 1 to Everything Pile' }));

    const stored = screen.getByTestId('task-spy').textContent ?? '';
    expect(stored).toContain('Email the landlord|none|small|later');
    expect(stored).not.toContain('Buy dog food');
  });

  it('sends the edited text, not the original, when a task is edited before sending', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Email the landlord');
    renderTool();
    typeAndSort('brain dump text');
    const input = await screen.findByDisplayValue('Email the landlord');

    fireEvent.change(input, { target: { value: 'Call the landlord instead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send 1 to Everything Pile' }));

    const stored = screen.getByTestId('task-spy').textContent ?? '';
    expect(stored).toContain('Call the landlord instead|none|small|later');
  });

  it('clears the input and shows a confirmation after sending', async () => {
    vi.mocked(runAiTool).mockResolvedValue('1. Email the landlord');
    renderTool();
    typeAndSort('brain dump text');
    await screen.findByDisplayValue('Email the landlord');

    fireEvent.click(screen.getByRole('button', { name: 'Send 1 to Everything Pile' }));

    expect(await screen.findByText('Sent 1 task to Everything Pile.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Email the landlord')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("What's on your mind?")).toHaveValue('');
  });

  it('shows an empty-state message when nothing actionable is found', async () => {
    vi.mocked(runAiTool).mockResolvedValue('NONE');
    renderTool();
    typeAndSort('just felt like complaining about the weather today');

    expect(await screen.findByText(/nothing actionable found/i)).toBeInTheDocument();
  });

  it('does not show a Dictate button when the browser has no speech recognition support', () => {
    renderTool();
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument();
  });

  describe('with speech recognition available', () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn(() => {
        this.onend?.();
      });
    }

    let lastInstance: MockSpeechRecognition;

    beforeEach(() => {
      (window as unknown as { SpeechRecognition: typeof MockSpeechRecognition }).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          lastInstance = this;
        }
      };
    });

    afterEach(() => {
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    });

    it('starts listening and appends recognized speech to the text field', () => {
      renderTool();

      fireEvent.click(screen.getByRole('button', { name: '🎙️ Dictate' }));
      expect(lastInstance.start).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '⏹ Stop dictating' })).toBeInTheDocument();

      act(() => {
        lastInstance.onresult?.({
          resultIndex: 0,
          results: [[{ transcript: 'remember to call the vet' }]],
        });
      });

      expect(screen.getByPlaceholderText("What's on your mind?")).toHaveValue('remember to call the vet');
    });

    it('stops listening on demand', () => {
      renderTool();
      fireEvent.click(screen.getByRole('button', { name: '🎙️ Dictate' }));
      fireEvent.click(screen.getByRole('button', { name: '⏹ Stop dictating' }));

      expect(lastInstance.stop).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '🎙️ Dictate' })).toBeInTheDocument();
    });
  });
});
