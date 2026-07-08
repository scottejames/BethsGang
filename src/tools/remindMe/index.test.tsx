import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { RemindersProvider } from '../../context/RemindersContext';
import { remindMeTool } from './index';

const Component = remindMeTool.Component;

function wrapper({ children }: { children: ReactNode }) {
  return <RemindersProvider>{children}</RemindersProvider>;
}

function renderTool() {
  return render(<Component />, { wrapper });
}

describe('RemindMe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T14:00:00'));
    window.localStorage.removeItem('beths-gang:reminders');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem('beths-gang:reminders');
  });

  it('shows a live preview for natural-language text and creates a reminder on submit', () => {
    renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me in 20 mins to have lunch' } });

    expect(screen.getByText(/i'll remind you to "have lunch" at/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));

    expect(screen.getByText('have lunch')).toBeInTheDocument();
    expect(screen.queryByText('No reminders set yet.')).not.toBeInTheDocument();
    // The natural-language field clears after a successful submit.
    expect(nlInput).toHaveValue('');
  });

  it('shows the parse failure reason instead of a preview when nothing can be understood', () => {
    renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'have a nice day' } });

    expect(screen.getByText(/couldn't work out when/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
  });

  it('cancel removes a reminder created via natural language', () => {
    renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me in 20 mins to stretch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set reminder' }));

    expect(screen.getByText('stretch')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('stretch')).not.toBeInTheDocument();
    expect(screen.getByText('No reminders set yet.')).toBeInTheDocument();
  });

  it('shows warn-before and repeat details on a reminder set via natural language', () => {
    renderTool();

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

  it('flags a reminder time in the past as an error without clearing the text', () => {
    renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, { target: { value: 'remind me on january 1 2020 at 9am to celebrate' } });

    expect(screen.getByText(/in the past/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
    // The text stays in the field so the user can edit and fix it, rather than being cleared.
    expect(nlInput).toHaveValue('remind me on january 1 2020 at 9am to celebrate');
  });

  it('flags a warning that would fall in the past as an error', () => {
    renderTool();

    const nlInput = screen.getByPlaceholderText(/remind me in 20 mins/i);
    fireEvent.change(nlInput, {
      target: { value: 'remind me in 1 min to have lunch, warn me 5 mins before' },
    });

    expect(screen.getByText(/warning.*past/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set reminder' })).toBeDisabled();
  });
});
