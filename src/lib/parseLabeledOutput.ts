// Shared by every AI tool whose response is a fixed set of "Label: value" lines (see
// each tool's system prompt in amplify/functions/ai-assist/handler.ts for the exact
// format it asks for) — the parsing algorithm is identical across tools; only the
// labels each one asks for differ.
export function makeLabelGetter(output: string) {
  const lines = output.split('\n').map((line) => line.trim());
  return (label: string) =>
    lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();
}

// For a labeled section whose value is itself a "- " bullet list (e.g. Is This Mad?'s
// "Asks:" section) rather than a single line.
export function getBulletList(output: string, label: string): string[] {
  const lines = output.split('\n').map((line) => line.trim());
  const index = lines.findIndex((line) => line.toLowerCase().startsWith(label.toLowerCase()));
  if (index === -1) return [];
  return lines
    .slice(index + 1)
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, ''));
}
