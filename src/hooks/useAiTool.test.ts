import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiTool } from './useAiTool';

// Only the network edge is mocked, so these run through the real aiClient and usageLog.
const { runAiTool, logEvent } = vi.hoisted(() => ({
  runAiTool: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({ queries: { runAiTool }, mutations: { logEvent } }),
}));

vi.mock('../context/EnergyContext', () => ({
  useEnergy: () => ({ spoons: 40 }),
}));

const loggedEvent = () => JSON.parse(logEvent.mock.calls[0][0].input);

describe('useAiTool', () => {
  beforeEach(() => {
    runAiTool.mockReset();
    logEvent.mockReset();
    runAiTool.mockResolvedValue({ data: 'the answer' });
    logEvent.mockResolvedValue({ data: 'ok' });
  });

  it('sends the tool ID and input wrapped with the energy level', async () => {
    const { result } = renderHook(() => useAiTool('brain-dump-sorter'));

    await act(() => result.current.run('so many thoughts'));

    expect(runAiTool).toHaveBeenCalledWith({
      toolId: 'brain-dump-sorter',
      input: JSON.stringify({ spoons: 40, input: 'so many thoughts' }),
    });
  });

  it('exposes and returns the answer on success', async () => {
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.run('a task');
    });

    expect(returned).toBe('the answer');
    expect(result.current.output).toBe('the answer');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('is loading only while the request is in flight', async () => {
    let finish: (value: { data: string }) => void = () => {};
    runAiTool.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    act(() => void result.current.run('a task'));
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => finish({ data: 'done' }));
    expect(result.current.loading).toBe(false);
  });

  it.each([
    ['nothing', null],
    ['an empty answer', ''],
    ['only whitespace', '  \n '],
  ])('tells the user when the AI sends back %s', async (_name, data) => {
    runAiTool.mockResolvedValue({ data });
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(result.current.output).toBeNull();
    expect(result.current.error).toBe("The AI didn't send anything back. Please try again.");
    await waitFor(() => expect(loggedEvent().detail.success).toBe(false));
  });

  // The pink error box: this is exactly how the Nov 2026 signed-in failure reached users.
  it('shows the server error when the backend rejects the request', async () => {
    runAiTool.mockResolvedValue({
      data: null,
      errors: [{ message: 'Not Authorized to access runAiTool on type Query' }],
    });
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    let returned: string | undefined = 'unset';
    await act(async () => {
      returned = await result.current.run('a task');
    });

    expect(result.current.error).toBe('Not Authorized to access runAiTool on type Query');
    expect(result.current.output).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(returned).toBeUndefined();
  });

  it('shows the error when the request itself fails', async () => {
    runAiTool.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to a friendly message when the failure is not an Error', async () => {
    runAiTool.mockRejectedValue('something odd');
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(result.current.error).toBe('Something went wrong. Please try again.');
  });

  it('clears the previous error when run again', async () => {
    runAiTool.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));
    expect(result.current.error).toBe('Network error');

    await act(() => result.current.run('a task'));
    expect(result.current.error).toBeNull();
    expect(result.current.output).toBe('the answer');
  });

  it('logs a successful call with the energy level', async () => {
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(loggedEvent()).toMatchObject({
      toolId: 'task-breakdown',
      event: 'ai_call',
      spoons: 40,
      detail: { success: true },
    });
  });

  it('logs a failed call too', async () => {
    runAiTool.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(loggedEvent()).toMatchObject({ event: 'ai_call', detail: { success: false } });
  });

  it("never puts the user's own words in the usage log", async () => {
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('my very private worries about money'));

    expect(logEvent.mock.calls[0][0].input).not.toContain('private worries');
  });

  it('still shows the answer if usage logging fails', async () => {
    logEvent.mockRejectedValue(new Error('Not Authorized to access logEvent'));
    const { result } = renderHook(() => useAiTool('task-breakdown'));

    await act(() => result.current.run('a task'));

    expect(result.current.output).toBe('the answer');
    expect(result.current.error).toBeNull();
  });
});
