// Splits Claude's numbered-list output ("1. ...", "2. ...") into items. Splits on a
// lookahead for the *next* numbered item rather than splitting line-by-line, so a reply
// that happens to span multiple lines stays together as one item instead of being
// silently split into two (see parseNumberedList.test.ts for the regression case).
export function parseNumberedList(output: string): string[] {
  return output
    .split(/\n(?=\d+[.)]\s)/)
    .map((chunk) => chunk.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}
