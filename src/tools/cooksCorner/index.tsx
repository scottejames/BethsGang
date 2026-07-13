import { useState } from 'react';
import { useAiTool } from '../../hooks/useAiTool';
import { StructuredResult } from '../../components/StructuredResult';
import type { StructuredField } from '../../components/StructuredResult';
import { meta } from './meta';
import type { ToolDefinition } from '../types';

interface CooksCornerPayload {
  fridgeItems?: string;
  yolo?: boolean;
  currentMealIdeas?: string;
  feedback?: string;
}

interface MealIdea {
  name: string;
  description: string;
  shop?: string;
}

function parseMealIdeas(output: string): MealIdea[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s/.test(line))
    .map((line) => {
      let rest = line.replace(/^\d+\.\s*/, '');
      let shop: string | undefined;

      const shopMatch = rest.match(/^(.*?)\s*\(Shop:\s*(.+)\)\s*$/i);
      if (shopMatch) {
        rest = shopMatch[1].trim();
        shop = shopMatch[2].trim();
      }

      const [name, ...descriptionParts] = rest.split(' — ');
      return {
        name: name.trim(),
        description: descriptionParts.join(' — ').trim(),
        shop,
      };
    });
}

interface Recipe {
  name: string;
  ingredients: string[];
  method: string[];
  shop?: string;
}

function parseRecipes(output: string): Recipe[] {
  return output
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.toLowerCase().startsWith('recipe:'))
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim());
      const name = lines[0].replace(/^recipe:\s*/i, '').trim();
      const ingredients: string[] = [];
      const method: string[] = [];
      let shop: string | undefined;
      let section: 'ingredients' | 'method' | null = null;

      for (const line of lines.slice(1)) {
        if (/^ingredients:?$/i.test(line)) {
          section = 'ingredients';
          continue;
        }
        if (/^method:?$/i.test(line)) {
          section = 'method';
          continue;
        }
        const shopMatch = line.match(/^shop:\s*(.+)$/i);
        if (shopMatch) {
          shop = shopMatch[1].trim();
          section = null;
          continue;
        }
        if (section === 'ingredients' && line.startsWith('-')) {
          ingredients.push(line.replace(/^-\s*/, ''));
        } else if (section === 'method' && /^\d+\.\s/.test(line)) {
          method.push(line.replace(/^\d+\.\s*/, ''));
        }
      }

      return { name, ingredients, method, shop };
    });
}

function CooksCorner() {
  const [fridgeItems, setFridgeItems] = useState('');
  const [feedback, setFeedback] = useState('');
  // Tracks whether the meal ideas currently on screen came from typed fridge items
  // or from YOLO's "just decide for me" path — so a later feedback/elaborate call
  // sends the right payload shape either way, without asking the user to have
  // typed anything just because they're now giving feedback.
  const [isYolo, setIsYolo] = useState(false);
  const { output, loading, error, run } = useAiTool(meta.id);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!fridgeItems.trim()) return;

    setIsYolo(false);
    const payload: CooksCornerPayload = { fridgeItems: fridgeItems.trim() };
    run(JSON.stringify(payload));
  }

  // One click, no typing required — the model is asked to suggest simple meals
  // from common everyday basics instead of specific listed fridge items. Ignores
  // whatever's currently in the textarea, if anything: YOLO means "don't make me
  // decide," not "consider what I've typed so far."
  function handleYolo() {
    setIsYolo(true);
    const payload: CooksCornerPayload = { yolo: true };
    run(JSON.stringify(payload));
  }

  // Sends the previous response back verbatim as context, same as Essay Structure
  // Planner's revision call — the model decides from the feedback's wording whether
  // that means "elaborate these into recipes" or "give me different ideas".
  function handleFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (!feedback.trim() || !output) return;

    const payload: CooksCornerPayload = {
      ...(isYolo ? { yolo: true } : { fridgeItems: fridgeItems.trim() }),
      currentMealIdeas: output,
      feedback: feedback.trim(),
    };
    run(JSON.stringify(payload)).then(() => setFeedback(''));
  }

  const recipes = output ? parseRecipes(output) : [];
  const mealIdeas = output && recipes.length === 0 ? parseMealIdeas(output) : [];
  const hasStructuredResult = recipes.length > 0 || mealIdeas.length > 0;

  return (
    <div className="tool-panel">
      <p className="tool-intro">
        List what's in your fridge and get a few dinner ideas built around it — you're
        assumed to have a regular dry store too (rice, pasta, oil, tinned tomatoes, and
        the usual staples), so no need to list those. Say which idea sounds good and
        you'll get the full recipe, including a heads-up if it's worth a quick trip to
        the shop for a couple of extras.
      </p>
      <form onSubmit={handleSubmit} className="tool-form">
        <textarea
          value={fridgeItems}
          onChange={(event) => setFridgeItems(event.target.value)}
          placeholder="e.g. cheese, capers, potatoes, chicken"
          rows={3}
          disabled={loading}
        />

        <div className="tool-form-row">
          <button type="submit" disabled={loading || !fridgeItems.trim()}>
            {loading && !isYolo ? 'Thinking of meals…' : 'Suggest meals'}
          </button>
          <button type="button" className="secondary-button" onClick={handleYolo} disabled={loading}>
            {loading && isYolo ? 'Thinking of meals…' : '🎲 YOLO'}
          </button>
        </div>
        <p className="tool-field-hint">
          Don't want to list your fridge? YOLO picks something simple from common
          everyday basics instead.
        </p>
      </form>

      {error && <p className="tool-error">{error}</p>}

      {mealIdeas.length > 0 && (
        <ol className="tool-result-list">
          {mealIdeas.map((idea, index) => (
            <li key={index}>
              <strong>{idea.name}</strong>
              {idea.description && ` — ${idea.description}`}
              {idea.shop && ` (Shop: ${idea.shop})`}
            </li>
          ))}
        </ol>
      )}

      {recipes.map((recipe, index) => {
        const fields = [
          recipe.ingredients.length > 0 &&
            ({
              label: 'Ingredients',
              value: (
                <ul className="tool-result-fields-list">
                  {recipe.ingredients.map((ingredient, ingredientIndex) => (
                    <li key={ingredientIndex}>{ingredient}</li>
                  ))}
                </ul>
              ),
            } as StructuredField),
          recipe.method.length > 0 &&
            ({
              label: 'Method',
              value: (
                <ol className="tool-result-fields-list">
                  {recipe.method.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
              ),
            } as StructuredField),
          recipe.shop && ({ label: 'Shop', value: recipe.shop } as StructuredField),
        ].filter((field): field is StructuredField => Boolean(field));

        return (
          <div className="recipe-card" key={index}>
            <h3 className="recipe-name">{recipe.name}</h3>
            <StructuredResult fields={fields} rawOutput={null} />
          </div>
        );
      })}

      {output && !hasStructuredResult && <p className="tool-result-plain">{output}</p>}

      {output && (
        <form onSubmit={handleFeedback} className="tool-form">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder='e.g. "The chicken piccata sounds good" or "more veggie options please"'
            rows={2}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !feedback.trim()}>
            {loading ? 'Updating…' : 'Update with feedback'}
          </button>
        </form>
      )}
    </div>
  );
}

export const cooksCornerTool: ToolDefinition = {
  meta,
  Component: CooksCorner,
};
