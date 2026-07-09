import { useEffect, useState } from 'react';
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
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // A missing key means "never initialized" (seed the defaults). A present-but-
    // empty array means the user deliberately cleared their list — respect that,
    // don't silently bring the defaults back.
    if (stored === null) {
      return DEFAULT_ITEMS.map((text) => ({ id: crypto.randomUUID(), text }));
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function DopamineMenu() {
  const [items, setItems] = useState<DopamineItem[]>(loadItems);
  const [newText, setNewText] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);

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

  function handleRemove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setRevealedId((current) => (current === id ? null : current));
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
    if (items.length === 0) return;
    // Avoid re-showing the same thing twice in a row when there's a choice not to.
    const candidates = items.length > 1 ? items.filter((item) => item.id !== revealedId) : items;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setRevealedId(pick.id);
  }

  const revealedItem = items.find((item) => item.id === revealedId) ?? null;

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Quick, easy things that reliably feel good — for when deciding what to do is the
        only thing in your way. Add your own below, then hit Surprise me whenever you want
        a shortcut straight to something rewarding instead of a decision.
      </p>

      <div className="tool-result-actions">
        <button type="button" onClick={handleSurprise} disabled={items.length === 0}>
          🎲 Surprise me
        </button>
      </div>

      {revealedItem && (
        <div className="dopamine-reveal">
          <p className="dopamine-reveal-text">{revealedItem.text}</p>
        </div>
      )}

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

      {items.length === 0 ? (
        <p className="task-empty">Nothing on the menu yet — add something above.</p>
      ) : (
        <ul className="dopamine-list">
          {items.map((item, index) => (
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
                  disabled={index === items.length - 1}
                  onClick={() => handleMove(item.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="copy-button"
                  aria-label={`Delete "${item.text}"`}
                  onClick={() => handleRemove(item.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const dopamineMenuTool: ToolDefinition = {
  meta,
  Component: DopamineMenu,
};
