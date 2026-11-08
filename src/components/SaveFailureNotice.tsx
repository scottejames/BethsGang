import { useEffect, useState } from 'react';
import { subscribeToSaveFailures, subscribeToSyncFailures } from '../lib/saveFailures';

const SAVE_MESSAGE = "Couldn't save your latest change. Please check your connection and try again.";
const SYNC_MESSAGE = "Couldn't load your latest changes. Please reload the page.";

// Stays until dismissed, because a timed message could be missed and the person would
// wrongly believe their change was saved. Several failures share one notice.
export function SaveFailureNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribeToSaveFailures(() => setMessage(SAVE_MESSAGE)), []);
  useEffect(() => subscribeToSyncFailures(() => setMessage(SYNC_MESSAGE)), []);

  if (!message) return null;

  return (
    <div className="save-failure-notice" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => setMessage(null)}>
        Dismiss
      </button>
    </div>
  );
}
