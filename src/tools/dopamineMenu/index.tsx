import { useEffect, useState } from 'react';
import { useUndoableDelete } from '../../hooks/useUndoableDelete';
import { UndoToastStack } from '../../components/UndoToastStack';
import { readStored } from '../../lib/localStorage';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface DopamineItem {
  id: string;
  text: string;
}

const STORAGE_KEY = 'beths-gang:dopamine-items';

// Seeded only the very first time the app runs (localStorage key absent) — kept
// short on purpose. A long default list turns "what do I even do right now" into
// its own decision-paralysis problem, which defeats the point of this tool.
const DEFAULT_ITEMS = [
  'Stretch for 2 minutes',
  'Step outside for a minute',
  'Put on a favourite song and just listen',
  'Splash cold water on your face',
  'Text a friend a meme',
  'Make a hot drink',
  'Doodle for 5 minutes',
  'Watch one short funny video',
];

function loadItems(): DopamineItem[] {
  // A missing key means "never initialized" (seed the defaults). A present-but-
  // empty array means the user deliberately cleared their list — respect that,
  // don't silently bring the defaults back.
  if (window.localStorage.getItem(STORAGE_KEY) === null) {
    return DEFAULT_ITEMS.map((text) => ({ id: crypto.randomUUID(), text }));
  }
  return readStored<DopamineItem>(STORAGE_KEY);
}

function DopamineMenu() {
  const [items, setItems] = useState<DopamineItem[]>(loadItems);
  const [newText, setNewText] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    setItems((current) => [...current, { id: crypto.randomUUID(), text: trimmed }]);
    setNewText('');
  }

  // Delete had no confirmation or undo — a misclick permanently lost an item with
  // no way back. Soft-delete with a brief undo window instead.
  const { pending: pendingDeletes, requestDelete, undo, isPending } = useUndoableDelete<DopamineItem>(
    (item) => {
      setItems((current) => current.filter((existing) => existing.id !== item.id));
    },
  );

  function handleRemove(item: DopamineItem) {
    requestDelete(item.id, item, item.text);
    setRevealedId((current) => (current === item.id ? null : current));
  }

  function handleMove(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function handleSurprise() {
    const eligible = items.filter((item) => !isPending(item.id));
    if (eligible.length === 0) return;
    // Avoid re-showing the same thing twice in a row when there's a choice not to.
    const candidates = eligible.length > 1 ? eligible.filter((item) => item.id !== revealedId) : eligible;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setRevealedId(pick.id);
  }

  const revealedItem = items.find((item) => item.id === revealedId) ?? null;
  // Pending-delete items disappear from view immediately (the undo toast is the
  // only remaining trace) — the actual removal only happens once the undo window
  // elapses with no undo.
  const visibleItems = items.filter((item) => !isPending(item.id));
  // Nothing to hide when the list is empty — force the editor open so there's
  // always a visible way to add the very first item.
  const showEditor = editing || visibleItems.length === 0;

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Quick, easy things that reliably feel good — for when deciding what to do is the
        only thing in your way. Hit Surprise me for a shortcut straight to something
        rewarding, or edit the list to add, reorder, or remove items.
      </p>

      <div className="dopamine-top-row">
        <div className="tool-result-actions">
          <button type="button" onClick={handleSurprise} disabled={visibleItems.length === 0}>
            🎲 Surprise me
          </button>
        </div>
        {visibleItems.length > 0 && (
          <button
            type="button"
            className="copy-button"
            aria-expanded={showEditor}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? 'Done editing' : '✎ Edit list'}
          </button>
        )}
      </div>

      {revealedItem && (
        <div className="dopamine-reveal">
          <p className="dopamine-reveal-text">{revealedItem.text}</p>
        </div>
      )}

      {showEditor && (
        <>
          <form onSubmit={handleAdd} className="add-task-row">
            <input
              type="text"
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
              placeholder="Add something that feels good"
              aria-label="New menu item"
            />
            <button type="submit" disabled={!newText.trim()}>
              Add
            </button>
          </form>

          {visibleItems.length === 0 ? (
            <p className="task-empty">Nothing on the menu yet — add something above.</p>
          ) : (
            <ul className="dopamine-list">
              {visibleItems.map((item, index) => (
                <li key={item.id} className="dopamine-item">
                  <p className="dopamine-item-text">{item.text}</p>
                  <div className="dopamine-item-controls">
                    <button
                      type="button"
                      className="copy-button"
                      aria-label={`Move "${item.text}" up`}
                      disabled={index === 0}
                      onClick={() => handleMove(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="copy-button"
                      aria-label={`Move "${item.text}" down`}
                      disabled={index === visibleItems.length - 1}
                      onClick={() => handleMove(item.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="copy-button"
                      aria-label={`Delete "${item.text}"`}
                      onClick={() => handleRemove(item)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <UndoToastStack
        items={pendingDeletes.map((entry) => ({ id: entry.id, label: entry.label }))}
        onUndo={undo}
      />
    </div>
  );
}

export const dopamineMenuTool: ToolDefinition = {
  meta,
  Component: DopamineMenu,
};
