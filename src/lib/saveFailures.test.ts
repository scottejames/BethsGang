import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { didSave, subscribeToSaveFailures, watchSave } from './saveFailures';

const serverError = () => Promise.resolve({ data: null, errors: [{ message: 'Not Authorized' }] });
const networkFailure = () => Promise.reject(new Error('Network error'));
const success = (): Promise<{ errors?: unknown[] }> => Promise.resolve({});

describe('watchSave', () => {
  const listener = vi.fn();
  let unsubscribe: () => void;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listener.mockReset();
    unsubscribe = subscribeToSaveFailures(listener);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    unsubscribe();
    consoleError.mockRestore();
  });

  it('stays quiet when the save worked', async () => {
    await watchSave(success(), 'Failed to save');

    expect(listener).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('stays quiet when errors is an empty list', async () => {
    await watchSave(Promise.resolve({ data: {}, errors: [] }), 'Failed to save');

    expect(listener).not.toHaveBeenCalled();
  });

  // Amplify resolves, rather than rejects, for these. A plain .catch misses them.
  it('reports a server error that came back as a normal result', async () => {
    await watchSave(serverError(), 'Failed to save');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('Failed to save', [{ message: 'Not Authorized' }]);
  });

  it('reports a network failure', async () => {
    await watchSave(networkFailure(), 'Failed to save');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never rejects, so one failure cannot break a batch of saves', async () => {
    await expect(watchSave(networkFailure(), 'Failed to save')).resolves.toBeUndefined();
  });

  it('stops notifying after unsubscribing', async () => {
    unsubscribe();

    await watchSave(serverError(), 'Failed to save');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('didSave', () => {
  it('is true for a successful save', async () => {
    await expect(didSave(success())).resolves.toBe(true);
  });

  it('is false for a server error that came back as a normal result', async () => {
    await expect(didSave(serverError())).resolves.toBe(false);
  });

  it('is false for a network failure', async () => {
    await expect(didSave(networkFailure())).resolves.toBe(false);
  });
});
