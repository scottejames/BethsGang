import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pomodoroTimerTool } from './index';

const Component = pomodoroTimerTool.Component;

// Regression test for a real bug: the completion side effects (setStatus,
// the pop sound) used to live inside the setRemainingSeconds updater, which
// React may invoke more than once (StrictMode does, in dev) — causing the
// pop sound to fire twice. See CHANGELOG.md for the fix.
describe('PomodoroTimer pop sound', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    playSpy.mockRestore();
  });

  it('plays the pop sound exactly once when the timer completes with visualise on', async () => {
    render(<Component />);

    const visualizeToggle = screen.getByRole('checkbox', { name: /visualise remaining time/i });
    act(() => {
      visualizeToggle.click();
    });

    const startButton = screen.getByRole('button', { name: '5 min' });
    act(() => {
      startButton.click();
    });

    // Advance through the full 5-minute countdown.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(screen.getByText(/time's up/i)).toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playSpy.mock.contexts[0]).toHaveProperty('src', expect.stringContaining('pop.mp3'));
  });

  it('does not play the pop sound when visualise is off', async () => {
    render(<Component />);

    const startButton = screen.getByRole('button', { name: '5 min' });
    act(() => {
      startButton.click();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(screen.getByText(/time's up/i)).toBeInTheDocument();
    expect(playSpy).not.toHaveBeenCalled();
  });
});
