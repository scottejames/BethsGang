import { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../context/TaskStoreContext';
import { useUndoableDelete } from '../../hooks/useUndoableDelete';
import { UndoToastStack } from '../../components/UndoToastStack';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface SidequestEntry {
  id: string;
  text: string;
  createdAt: string;
}

const STORAGE_KEY = 'beths-gang:sidequest-log';

function loadEntries(): SidequestEntry[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SideQuestLog() {
  const [entries, setEntries] = useState<SidequestEntry[]>(loadEntries);
  const [text, setText] = useState('');
  const { addTask } = useTaskStore();
  // Guards against a fast double-click promoting the same entry twice — same shape
  // as the guard in taskBreakdown/index.tsx and brainDumpSorter/index.tsx (a ref, not
  // state, since two click handlers can run back-to-back before a re-render).
  const promotedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: SidequestEntry = { id: crypto.randomUUID(), text: trimmed, createdAt: new Date().toISOString() };
    // Newest first — whatever you just logged lands right next to the input you typed
    // it into, no scrolling needed to confirm it landed.
    setEntries((current) => [entry, ...current]);
    setText('');
  }

  function removeEntry(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  // "Done"/"Bin it" are genuinely destructive (the entry's text is just gone) with
  // no existing safety net — soft-delete with a brief undo window. "Make it a task"
  // below deliberately doesn't go through this: its content survives as a task in
  // Everything Pile, so there's nothing to undo in the same sense.
  const { pending: pendingDeletes, requestDelete, undo, isPending } = useUndoableDelete<SidequestEntry>(
    (entry) => removeEntry(entry.id),
  );

  function handleDelete(entry: SidequestEntry) {
    requestDelete(entry.id, entry, entry.text);
  }

  // Promotes into the Shared Task Store (see TaskStoreContext) rather than the log
  // being a dead end — lands project-less ("Everything Else" in Everything Pile),
  // small and "later" by default since it wasn't urgent enough to just do on the spot.
  function promoteEntry(entry: SidequestEntry) {
    if (promotedIdsRef.current.has(entry.id)) return;
    promotedIdsRef.current.add(entry.id);
    addTask({ title: entry.text, projectId: undefined, size: 'small', category: 'later' });
    removeEntry(entry.id);
  }

  // Pending-delete entries disappear from view immediately (the undo toast is the
  // only remaining trace) — the actual removal only happens once the undo window
  // elapses with no undo.
  const visibleEntries = entries.filter((entry) => !isPending(entry.id));

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        A one-line parking spot for the stray thought that just pulled your attention.
        Log it, keep working, and come back later to sort each one out: mark it done,
        turn it into a real task in Everything Pile, or bin it if it turned out not to
        matter.
      </p>

      <form onSubmit={handleAdd} className="add-task-row">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What just pulled your attention?"
          aria-label="New side quest"
        />
        <button type="submit" disabled={!text.trim()}>
          Log it
        </button>
      </form>

      {visibleEntries.length === 0 ? (
        <p className="task-empty">Nothing logged yet — add a stray thought whenever one pulls at you.</p>
      ) : (
        <ul className="sidequest-list">
          {visibleEntries.map((entry) => (
            <li key={entry.id} className="sidequest-item">
              <p className="sidequest-item-text">{entry.text}</p>
              <div className="sidequest-item-controls">
                <button
                  type="button"
                  className="copy-button"
                  aria-label={`Mark "${entry.text}" done`}
                  onClick={() => handleDelete(entry)}
                >
                  Done
                </button>
                <button
                  type="button"
                  className="copy-button"
                  aria-label={`Turn "${entry.text}" into a task`}
                  onClick={() => promoteEntry(entry)}
                >
                  Make it a task
                </button>
                <button
                  type="button"
                  className="copy-button"
                  aria-label={`Bin "${entry.text}"`}
                  onClick={() => handleDelete(entry)}
                >
                  Bin it
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <UndoToastStack
        items={pendingDeletes.map((entry) => ({ id: entry.id, label: entry.label }))}
        onUndo={undo}
      />
    </div>
  );
}

export const sideQuestLogTool: ToolDefinition = {
  meta,
  Component: SideQuestLog,
};
