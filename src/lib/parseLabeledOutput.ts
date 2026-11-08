// Shared by every AI tool whose response is a fixed set of "Label: value" lines (see
// each tool's system prompt in amplify/functions/ai-assist/handler.ts for the exact
// format it asks for) — the parsing algorithm is identical across tools; only the
// labels each one asks for differ.

// The system prompt asks for plain text, but a model can still reply with "**Tone:** Calm",
// "**Tone**: Calm" or "## Tone: Calm". Without this those fields would silently vanish.
// Only the label's own markers are removed, so a value like "snake_case" is left alone.
function stripLabelMarkdown(rawLine: string): string {
  const line = rawLine.trim().replace(/^#{1,6}\s+/, '');
  const opening = line.match(/^[*_]+/)?.[0];
  if (!opening) return line;
  const body = line.slice(opening.length);
  const unwrapped = body.endsWith(opening) ? body.slice(0, -opening.length) : body;
  return unwrapped.replace(/^([^*_:]+?)[*_]*:[*_]*\s*/, '$1: ').trim();
}

const startsWithLabel = (line: string, label: string) => line.toLowerCase().startsWith(label.toLowerCase());

export function makeLabelGetter(output: string) {
  const lines = output.split('\n').map(stripLabelMarkdown);
  return (label: string) => lines.find((line) => startsWithLabel(line, label))?.slice(label.length).trim();
}

// For a labeled section whose value is itself a "- " bullet list (e.g. Is This Mad?'s
// "Asks:" section) rather than a single line.
export function getBulletList(output: string, label: string): string[] {
  const lines = output.split('\n').map(stripLabelMarkdown);
  const index = lines.findIndex((line) => startsWithLabel(line, label));
  if (index === -1) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .slice(index + 1)
    .filter((line) => /^(-|\*\s)/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, ''));
}
