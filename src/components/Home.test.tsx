import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthProvider } from '../context/AuthContext';
import { EnergyProvider } from '../context/EnergyContext';
import { RemindersProvider } from '../context/RemindersContext';
import { ToolNavigationProvider } from '../context/ToolNavigationContext';
import { Home } from './Home';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EnergyProvider>
        <RemindersProvider>
          <ToolNavigationProvider>{children}</ToolNavigationProvider>
        </RemindersProvider>
      </EnergyProvider>
    </AuthProvider>
  );
}

function renderHome(onSelectTool = vi.fn()) {
  render(<Home onSelectTool={onSelectTool} />, { wrapper });
  return onSelectTool;
}

// Mirrors App.tsx's real `{activeTool ? <ToolShell>... : <Home ...>}` pattern — Home
// genuinely unmounts while a tool is open, and remounts when going back. Rendered
// once via `wrapper` so the surrounding providers (where the active-tab state now
// lives) stay mounted throughout; only `rerender` toggles Home itself.
function HomeOrNothing({ onSelectTool, showHome }: { onSelectTool: (id: string) => void; showHome: boolean }) {
  return showHome ? <Home onSelectTool={onSelectTool} /> : null;
}

describe('Home', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beths-gang:reminders');
    window.localStorage.removeItem('beths-gang:reminders-migrated');
    window.localStorage.removeItem('beths-gang:energy-spoons');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    window.localStorage.removeItem('beths-gang:reminders');
    window.localStorage.removeItem('beths-gang:reminders-migrated');
    window.localStorage.removeItem('beths-gang:energy-spoons');
  });

  it('defaults to the General Purpose tab, showing general tools but not planning ones', () => {
    renderHome();
    expect(screen.getByRole('tab', { name: 'General Purpose' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Distract Me')).toBeInTheDocument();
    expect(screen.getByText('Pomodoro Timer')).toBeInTheDocument();
    expect(screen.queryByText('Everything Pile')).not.toBeInTheDocument();
    expect(screen.queryByText('Task Breakdown')).not.toBeInTheDocument();
  });

  it('switches to the Planning tab, showing only the tools wired into the Shared Task Store', () => {
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }));

    expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Everything Pile')).toBeInTheDocument();
    expect(screen.getByText('Task Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Side Quest Log')).toBeInTheDocument();
    expect(screen.getByText('Brain Dump Sorter')).toBeInTheDocument();
    expect(screen.queryByText('Distract Me')).not.toBeInTheDocument();
    expect(screen.queryByText('Remind Me')).not.toBeInTheDocument();
  });

  it('selecting a tool card calls onSelectTool with its id', () => {
    const onSelectTool = renderHome();
    fireEvent.click(screen.getByText('Pomodoro Timer'));
    expect(onSelectTool).toHaveBeenCalledWith('pomodoro-timer');
  });

  it('keeps the active-reminder badge working on the General Purpose tab', () => {
    window.localStorage.setItem(
      'beths-gang:reminders',
      JSON.stringify([
        {
          id: 'r1',
          message: 'have lunch',
          fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          warnedForCurrentFireAt: false,
          repeat: { kind: 'none' },
        },
      ]),
    );
    renderHome();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('remembers the Planning tab across Home unmounting and remounting (going back from a tool)', () => {
    const onSelectTool = vi.fn();
    const { rerender } = render(<HomeOrNothing onSelectTool={onSelectTool} showHome />, { wrapper });

    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }));
    fireEvent.click(screen.getByText('Task Breakdown'));

    // Simulate App.tsx swapping Home out for the opened tool, then back again.
    rerender(<HomeOrNothing onSelectTool={onSelectTool} showHome={false} />);
    rerender(<HomeOrNothing onSelectTool={onSelectTool} showHome />);

    expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Everything Pile')).toBeInTheDocument();
  });

  it('going back from a General Purpose tool still shows General Purpose (not stuck on a prior tab)', () => {
    const onSelectTool = vi.fn();
    const { rerender } = render(<HomeOrNothing onSelectTool={onSelectTool} showHome />, { wrapper });

    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }));
    fireEvent.click(screen.getByRole('tab', { name: 'General Purpose' }));
    fireEvent.click(screen.getByText('Pomodoro Timer'));

    rerender(<HomeOrNothing onSelectTool={onSelectTool} showHome={false} />);
    rerender(<HomeOrNothing onSelectTool={onSelectTool} showHome />);

    expect(screen.getByRole('tab', { name: 'General Purpose' })).toHaveAttribute('aria-selected', 'true');
  });
});
