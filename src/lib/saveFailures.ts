// The one place that decides whether a signed-in save actually worked.
//
// A `.catch` is not enough on its own. Amplify's model operations only reject on network
// failures: a server error such as "Not Authorized" resolves normally, with the problem
// listed in `errors`. See handleSingularGraphQlError in @aws-amplify/data-schema.
interface SaveResult {
  errors?: readonly unknown[] | null;
}

const saveListeners = new Set<() => void>();
const syncListeners = new Set<() => void>();

function addListener(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const subscribeToSaveFailures = (listener: () => void) => addListener(saveListeners, listener);
export const subscribeToSyncFailures = (listener: () => void) => addListener(syncListeners, listener);

// A live-update error means the connection has failed for good: Amplify reconnects after
// brief dropouts without reporting one. The data on screen stops updating from here on.
export function reportSyncFailure(description: string, error: unknown): void {
  console.error(description, error);
  syncListeners.forEach((listener) => listener());
}

function warnSaveFailed(description: string, failure: unknown): void {
  console.error(description, failure);
  saveListeners.forEach((listener) => listener());
}

async function findFailure(operation: PromiseLike<SaveResult>): Promise<unknown> {
  try {
    const result = await operation;
    return result?.errors?.length ? result.errors : undefined;
  } catch (error) {
    return error ?? 'Unknown error';
  }
}

// For a save with its own fallback, where a failure isn't yet worth warning about.
export async function didSave(operation: PromiseLike<SaveResult>): Promise<boolean> {
  return (await findFailure(operation)) === undefined;
}

// Never rejects, so callers can fire and forget or include it in a Promise.all.
export async function watchSave(
  operation: PromiseLike<SaveResult>,
  description: string,
): Promise<void> {
  const failure = await findFailure(operation);
  if (failure === undefined) return;
  warnSaveFailed(description, failure);
}

// The server's answer when a row with that id already exists.
export function isAlreadySaved(failure: unknown): boolean {
  return (
    Array.isArray(failure) &&
    failure.length > 0 &&
    failure.every((error) => /ConditionalCheckFailed/.test(error?.errorType ?? ''))
  );
}

// Moves local data into an account. `flagKey` is only set once everything has arrived, so
// a failed move is retried next time the app opens. A retry re-sends items that made it
// the first time, so "already exists" counts as success, not as a failure to warn about.
export async function moveToAccount(
  saves: PromiseLike<SaveResult>[],
  description: string,
  flagKey: string,
): Promise<void> {
  const failures = (await Promise.all(saves.map(findFailure))).filter(
    (failure) => failure !== undefined && !isAlreadySaved(failure),
  );
  if (failures.length) {
    warnSaveFailed(description, failures);
    return;
  }
  window.localStorage.setItem(flagKey, 'true');
}
