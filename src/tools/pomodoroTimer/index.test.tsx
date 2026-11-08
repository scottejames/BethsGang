import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('PomodoroTimer controls', () => {
  const start = (minutes: number) =>
    fireEvent.click(screen.getByRole('button', { name: `${minutes} min` }));
  const pass = (seconds: number) => act(() => vi.advanceTimersByTimeAsync(seconds * 1000));
  const clock = (time: string) => expect(screen.getByText(time)).toBeInTheDocument();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    render(<Component />);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits at 5:00 with no controls until a length is picked', async () => {
    clock('5:00');
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();

    await pass(3);

    clock('5:00');
  });

  it.each([
    [5, '4:59'],
    [10, '9:59'],
    [15, '14:59'],
  ])('counts down from a %i minute preset', async (minutes, afterOneSecond) => {
    start(minutes);
    clock(`${minutes}:00`);

    await pass(1);

    clock(afterOneSecond);
  });

  it('holds the time while stopped and continues on Resume', async () => {
    start(5);
    await pass(3);
    clock('4:57');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await pass(10);
    clock('4:57');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await pass(2);
    clock('4:55');
  });

  it('returns to the chosen length on Reset and stops counting', async () => {
    start(15);
    await pass(5);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    clock('15:00');
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();

    await pass(5);
    clock('15:00');
  });

  it('restarts cleanly when another length is picked mid-countdown', async () => {
    start(5);
    await pass(3);

    start(10);
    clock('10:00');

    await pass(1);
    clock('9:59'); // exactly one tick: the old countdown must not still be running
  });

  it('offers only Reset once the time is up', async () => {
    start(5);

    await pass(5 * 60);

    clock('0:00');
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('can start again after finishing', async () => {
    start(5);
    await pass(5 * 60);

    start(5);
    await pass(1);

    clock('4:59');
    expect(screen.queryByText(/time's up/i)).not.toBeInTheDocument();
  });
});
