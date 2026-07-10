import { useState } from 'react';
import { phraseCategories } from './phrases';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

function EssayPhraseBank() {
  const [activeCategoryId, setActiveCategoryId] = useState(phraseCategories[0].id);
  const [search, setSearch] = useState('');
  const [copiedPhrase, setCopiedPhrase] = useState<string | null>(null);

  const trimmedSearch = search.trim().toLowerCase();
  // A search takes over the whole bank (every category), since "which category was
  // it in" is exactly what someone searching has usually forgotten — falling back to
  // category browsing only when there's nothing typed.
  const visiblePhrases = trimmedSearch
    ? phraseCategories.flatMap((category) => category.phrases.filter((phrase) => phrase.toLowerCase().includes(trimmedSearch)))
    : phraseCategories.find((category) => category.id === activeCategoryId)?.phrases ?? [];

  async function handleCopy(phrase: string) {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopiedPhrase(phrase);
      setTimeout(() => {
        setCopiedPhrase((current) => (current === phrase ? null : current));
      }, 1500);
    } catch {
      // Clipboard access unavailable — the phrase is still visible to copy by hand.
    }
  }

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        Ready-made sentence starters for common jobs an essay needs to do — opening a
        paragraph, giving an example, being critical of a source, wrapping up. Pick a
        category or search, then copy a starter and fill in the blanks.
      </p>

      <label className="tool-field">
        <span>Search phrases</span>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="e.g. however, example, conclusion"
        />
      </label>

      {!trimmedSearch && (
        <div className="tool-form-row" role="group" aria-label="Phrase category">
          {phraseCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={activeCategoryId === category.id}
              className={`preset-button${activeCategoryId === category.id ? ' preset-button-active' : ''}`}
              onClick={() => setActiveCategoryId(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      {!trimmedSearch && (
        <p className="tool-field-hint">
          {phraseCategories.find((category) => category.id === activeCategoryId)?.hint}
        </p>
      )}

      {visiblePhrases.length === 0 ? (
        <p className="task-empty">No phrases match "{search}" — try a different word.</p>
      ) : (
        <ul className="reply-list">
          {visiblePhrases.map((phrase, index) => (
            <li key={`${phrase}-${index}`} className="reply-item">
              <p>{phrase}</p>
              <button type="button" className="copy-button" onClick={() => handleCopy(phrase)}>
                {copiedPhrase === phrase ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const essayPhraseBankTool: ToolDefinition = {
  meta,
  Component: EssayPhraseBank,
};
