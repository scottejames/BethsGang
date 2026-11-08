// The one place that decides whether a signed-in save actually worked.
//
// A `.catch` is not enough on its own. Amplify's model operations only reject on network
// failures: a server error such as "Not Authorized" resolves normally, with the problem
// listed in `errors`. See handleSingularGraphQlError in @aws-amplify/data-schema.
interface SaveResult {
  errors?: readonly unknown[] | null;
}

const listeners = new Set<() => void>();

export function subscribeToSaveFailures(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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
  console.error(description, failure);
  listeners.forEach((listener) => listener());
}
