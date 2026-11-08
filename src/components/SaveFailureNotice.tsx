import { useEffect, useState } from 'react';
import { subscribeToSaveFailures } from '../lib/saveFailures';

// Stays until dismissed, because a timed message could be missed and the person would
// wrongly believe their change was saved. Several failures share one notice.
export function SaveFailureNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeToSaveFailures(() => setVisible(true)), []);

  if (!visible) return null;

  return (
    <div className="save-failure-notice" role="alert">
      <span>Couldn't save your latest change. Please check your connection and try again.</span>
      <button type="button" onClick={() => setVisible(false)}>
        Dismiss
      </button>
    </div>
  );
}
