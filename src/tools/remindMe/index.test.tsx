import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import * as amplifyAuth from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { RemindersProvider } from '../../context/RemindersContext';
import { AuthProvider } from '../../context/AuthContext';
import { remindMeTool } from './index';

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: vi.fn(() => vi.fn()) },
}));

const Component = remindMeTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RemindersProvider>{children}</RemindersProvider>
    </AuthProvider>
  );
}

// Awaits the sign-in check (a microtask) past its initial "loading" state before
// returning, since RemindMe's Active Reminders list now shows a neutral "Loading…"
// placeholder instead of local reminders until that resolves (see index.tsx) — every
// test below is interacting with the settled list, not the momentary loading one.
async function renderTool() {
  const result = render(<Component />, { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return result;
}

describe('RemindMe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T14:00:00'));
    window.localStorage.removeItem('beths-gang:reminders');
    vi.mocked(amplifyAuth.getCurrentUser).mockReset().mockRejectedValue(new Error('not signed in'));
    vi.mocked(amplifyAuth.signOut).mockReset();
    vi.mocked(Hub.listen).mockReset().mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem('beths-gang:reminders');
  });

  it('shows a neutral loading state instead of local reminders while the sign-in check is pending', async () => {
    // Local data left over from before signing in (or from being signed out) —
    // showing this while we don't yet know if the user is actually signed in (and
    // would get different, real account data any moment) is exactly the bug: a
    // brief flash of data that may not belong to the current session.
    window.localStorage.setItem(
      'beths-gang:reminders',
      JSON.stringify([
        {
          id: 'local-1',
          message: 'left over from before signing in',
          fireAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          warnedForCurrentFireAt: false,
          repeat: { kind: 'none' },
        },
      ]),
    );

    let rejectAuth: (reason: Error) => void = () => {};
    vi.mocked(amplifyAuth.getCurrentUser)
      .mockReset()
      .mockReturnValue(new Promise((_resolve, reject) => { rejectAuth = reject; }));

    render(<Component />, { wrapper });

    // Still pending — must show neither the stale local reminder nor a confident
    // "No reminders set yet." (which isn't known to be true yet either).
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('left over from before signing in')).not.toBeInTheDocument();
    expect(screen.queryByText('No reminders set yet.')).not.toBeInTheDocument();

    // Resolves as signed-out — the loading gate should lift and reveal the (in this
    // case correct) local reminder.
    await act(async () => {
      rejectAuth(new Error('not signed in'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('left over from before signing in')).toBeInTheDocument();
  });

  it('shows a live preview for natural-language text and creates a reminder on submit', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me in 20 mins to have lunch' } });

    expect(screen.getByText(/i'll remind you to "have lunch" at/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));

    expect(screen.getByText('have lunch')).toBeInTheDocument();
    expect(screen.queryByText('No reminders set yet.')).not.toBeInTheDocument();
    // The natural-language field clears after a successful submit.
    expect(nlInput).toHaveValue('');
  });

  it('shows the parse failure reason instead of a preview when nothing can be understood', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'have a nice day' } });

    expect(screen.getByText(/couldn't work out when/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
  });

  it('cancel removes a reminder created via natural language', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me in 20 mins to stretch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));

    expect(screen.getByText('stretch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('stretch')).not.toBeInTheDocument();
    expect(screen.getByText('No reminders set yet.')).toBeInTheDocument();
  });

  it('shows warn-before and repeat details on a reminder set via natural language', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, {
      target: { value: 'remind me at 5.30 to go home, warn me 20 mins before' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));
    expect(screen.getByText((_, element) => element?.textContent === 'Reminder: 8 Jul 2026, 17:30')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Warning: 8 Jul 2026, 17:10')).toBeInTheDocument();

    fireEvent.change(nlInput, { target: { value: 'remind me every day at 9am to take meds' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));
    expect(screen.getByText(/repeats daily/i)).toBeInTheDocument();
  });

  it('flags a reminder time in the past as an error without clearing the text', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me on january 1 2020 at 9am to celebrate' } });

    expect(screen.getByText(/in the past/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
    // The text stays in the field so the user can edit and fix it, rather than being cleared.
    expect(nlInput).toHaveValue('remind me on january 1 2020 at 9am to celebrate');
  });

  it('flags a warning that would fall in the past as an error', async () => {
    await renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, {
      target: { value: 'remind me in 1 min to have lunch, warn me 5 mins before' },
    });

    expect(screen.getByText(/warning.*past/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
  });
});
