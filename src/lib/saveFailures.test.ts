import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  didSave,
  isAlreadySaved,
  moveToAccount,
  reportSyncFailure,
  subscribeToSaveFailures,
  subscribeToSyncFailures,
  watchSave,
} from './saveFailures';

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

const alreadyExists = () =>
  Promise.resolve({ data: null, errors: [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }] });

describe('isAlreadySaved', () => {
  it('recognises the server saying the row exists', async () => {
    expect(isAlreadySaved((await alreadyExists()).errors)).toBe(true);
  });

  it.each([
    ['another server error', [{ errorType: 'Unauthorized' }]],
    ['a mix of errors', [{ errorType: 'DynamoDB:ConditionalCheckFailedException' }, { errorType: 'Unauthorized' }]],
    ['no errors', []],
    ['a network failure', new Error('Network error')],
  ])('does not count %s', (_name, failure) => {
    expect(isAlreadySaved(failure)).toBe(false);
  });
});

describe('moveToAccount', () => {
  const FLAG = 'test:moved';
  const listener = vi.fn();
  let unsubscribe: () => void;

  beforeEach(() => {
    window.localStorage.removeItem(FLAG);
    listener.mockReset();
    unsubscribe = subscribeToSaveFailures(listener);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    unsubscribe();
    vi.restoreAllMocks();
    window.localStorage.removeItem(FLAG);
  });

  it('marks the move finished when everything arrives', async () => {
    await moveToAccount([success(), success()], 'Failed', FLAG);

    expect(window.localStorage.getItem(FLAG)).toBe('true');
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ['a server error', serverError],
    ['a network failure', networkFailure],
  ])('leaves the move unfinished and warns after %s', async (_name, fail) => {
    await moveToAccount([success(), fail()], 'Failed', FLAG);

    expect(window.localStorage.getItem(FLAG)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('counts items that already arrived as moved', async () => {
    await moveToAccount([alreadyExists(), success()], 'Failed', FLAG);

    expect(window.localStorage.getItem(FLAG)).toBe('true');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('reportSyncFailure', () => {
  it('tells listeners, separately from failed saves', () => {
    const onSync = vi.fn();
    const onSave = vi.fn();
    const stopSync = subscribeToSyncFailures(onSync);
    const stopSave = subscribeToSaveFailures(onSave);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    reportSyncFailure('Failed', new Error('connection failed'));

    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    stopSync();
    stopSave();
    vi.restoreAllMocks();
  });
});
