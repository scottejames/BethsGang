import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportSyncFailure, watchSave } from '../lib/saveFailures';
import { SaveFailureNotice } from './SaveFailureNotice';

const failSave = () =>
  act(() => watchSave(Promise.resolve({ errors: [{ message: 'Not Authorized' }] }), 'Failed'));

describe('SaveFailureNotice', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows nothing until a save fails', () => {
    render(<SaveFailureNotice />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tells the user to reload when live updates fail', () => {
    render(<SaveFailureNotice />);

    act(() => reportSyncFailure('Failed', new Error('connection failed')));

    expect(screen.getByRole('alert')).toHaveTextContent(/reload the page/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/couldn't save/i);
  });

  it('warns the user when a save fails', async () => {
    render(<SaveFailureNotice />);

    await failSave();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save your latest change/i);
  });

  it('shows one notice for several failures', async () => {
    render(<SaveFailureNotice />);

    await failSave();
    await failSave();

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('can be dismissed', async () => {
    render(<SaveFailureNotice />);
    await failSave();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('comes back if another save fails after being dismissed', async () => {
    render(<SaveFailureNotice />);
    await failSave();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await failSave();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
