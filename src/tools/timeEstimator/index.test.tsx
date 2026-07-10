import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../../context/AuthContext';
import { EnergyProvider } from '../../context/EnergyContext';
import { runAiTool } from '../../lib/aiClient';
import { timeEstimatorTool } from './index';

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

const Component = timeEstimatorTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>{children}</EnergyProvider>
    </AuthProvider>
  );
}

function renderTool() {
  return render(<Component />, { wrapper });
}

describe('TimeEstimator', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:energy-spoons');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
    vi.mocked(runAiTool).mockReset();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem('beths-gang:energy-spoons');
  });

  it('disables submit until a task is entered', () => {
    renderTool();
    const submit = screen.getByRole('button', { name: 'Estimate it' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/drop the car off/i), { target: { value: 'Renew my passport' } });
    expect(submit).not.toBeDisabled();
  });

  it('renders the three structured fields from the AI response', async () => {
    vi.mocked(runAiTool).mockResolvedValue(
      'Realistic estimate: 20-30 minutes\nBuffer: add 15 minutes — the post office queue is unpredictable\nBlock off: 45 minutes',
    );
    renderTool();

    fireEvent.change(screen.getByPlaceholderText(/drop the car off/i), { target: { value: 'Post a parcel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate it' }));

    await screen.findByText('20-30 minutes');
    expect(screen.getByText('Realistic estimate')).toBeInTheDocument();
    expect(screen.getByText(/add 15 minutes/)).toBeInTheDocument();
    expect(screen.getByText('Block off')).toBeInTheDocument();
    expect(screen.getByText('45 minutes')).toBeInTheDocument();
  });

  it('sends the task text as the raw input, unwrapped', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Realistic estimate: 3 minutes\nBuffer: none needed\nBlock off: 5 minutes');
    renderTool();

    fireEvent.change(screen.getByPlaceholderText(/drop the car off/i), { target: { value: 'Water the plants' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate it' }));
    await screen.findByText('3 minutes');

    const [, envelope] = vi.mocked(runAiTool).mock.calls[0];
    const { input } = JSON.parse(envelope);
    expect(input).toBe('Water the plants');
  });

  it('falls back to plain text when the response is not in the expected format', async () => {
    vi.mocked(runAiTool).mockResolvedValue('Somewhere between 10 and 20 minutes, honestly.');
    renderTool();

    fireEvent.change(screen.getByPlaceholderText(/drop the car off/i), { target: { value: 'Tidy the desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Estimate it' }));

    await screen.findByText('Somewhere between 10 and 20 minutes, honestly.');
    expect(screen.queryByText('Realistic estimate')).not.toBeInTheDocument();
  });
});
