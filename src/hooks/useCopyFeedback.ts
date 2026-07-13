import { useState } from 'react';

const RESET_DELAY_MS = 1500;

// Copies text to the clipboard and tracks which item was last copied, for a "Copied"
// label that reverts after a short delay — shared by every tool with a per-item copy
// button (Essay Phrase Bank's phrases, Reply Starter's drafts). `value` is whatever
// identifies the item to the caller (the phrase itself, a list index, ...) — it doesn't
// have to be the copied text itself.
export function useCopyFeedback<T>() {
  const [copied, setCopied] = useState<T | null>(null);

  async function copy(value: T, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(value);
      setTimeout(() => {
        setCopied((current) => (current === value ? null : current));
      }, RESET_DELAY_MS);
    } catch {
      // Clipboard access unavailable — the text is still visible to copy by hand.
    }
  }

  return { copied, copy };
}
