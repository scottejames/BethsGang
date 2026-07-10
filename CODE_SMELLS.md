# Code Smell Review — 2026-07-10

A read-through of the whole `src/`/`amplify/` codebase against `CODING_GUIDELINES.md`,
with an explicit focus on simplification. **No code was changed** — this is a list to
work through together, not a patch. Each finding is numbered for easy reference in
discussion, tagged with the guideline section it relates to, and rated for how safe/
mechanical the fix would be.

Methodology: read every non-test `.ts`/`.tsx` file in `src/` and `amplify/` in full
(not a diff or a sample), cross-referencing repeated shapes across files rather than
judging each file in isolation — most of what's below only becomes visible once you've
read three or four tools back to back and start noticing the same twenty lines again.

---

## Top simplification opportunities

These are ranked by **impact × safety** — how much duplicated knowledge it removes,
versus how mechanical/low-risk the extraction would be.

### 1. Three tools hand-roll the identical "labeled-field" parser

**Where:** `src/tools/toneChecker/index.tsx` (`parseResult`), `src/tools/callScript/index.tsx`
(`parseScript`), `src/tools/isThisMad/index.tsx` (`parseResult`).

**What's duplicated:** this exact block, byte-for-byte identical in all three files:

```ts
const lines = output.split('\n').map((line) => line.trim());
const get = (label: string) =>
  lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();
```

Each tool then calls `get('Tone:')`, `get('Opening:')`, etc. with its own labels.
`isThisMad` additionally has its own bullet-list extractor (`asksIndex`/`asks`) bolted
onto the same pattern, which is itself a generalizable "get everything after label X
that starts with `-`" operation.

**Why it matters:** this is exactly the "DRY is about knowledge" case from
`CODING_GUIDELINES.md` §1 — all three tools share the actual *algorithm* for parsing
Claude's structured plain-text output, not just similar-looking code. If the label
format ever needs to change (e.g. to tolerate a trailing space or a colon variant), it
has to change in three places and it's easy to miss one.

**Suggested fix (safe, mechanical):** extract to `src/lib/parseLabeledOutput.ts`:

```ts
export function makeLabelGetter(output: string) {
  const lines = output.split('\n').map((line) => line.trim());
  return (label: string) =>
    lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();
}

export function getBulletList(output: string, label: string): string[] {
  const lines = output.split('\n').map((line) => line.trim());
  const index = lines.findIndex((line) => line.toLowerCase().startsWith(label.toLowerCase()));
  if (index === -1) return [];
  return lines.slice(index + 1).filter((line) => line.startsWith('-')).map((line) => line.replace(/^-\s*/, ''));
}
```

Each tool's own `parseResult`/`parseScript` stays — it's still tool-specific which
labels it asks for — but the shared primitive collapses to one implementation instead
of three.

### 2. Four backend message builders duplicate the same JSON-parse-and-assemble shape

**Where:** `amplify/functions/ai-assist/handler.ts` — `buildReplyStarterMessage`,
`buildToneCheckerMessage`, `buildCallScriptMessage`, `buildIsThisMadMessage`.

**What's duplicated:** all four follow the identical shape:

```ts
let parsed: Partial<SomeInput>;
try {
  parsed = JSON.parse(rawInput);
} catch {
  parsed = { message: rawInput };
}
const message = parsed.message ?? rawInput;
// ...pick a few optional fields...
return [/* labeled lines */].filter((line): line is string => Boolean(line)).join('\n\n');
```

This is the same class of duplication as #1, just on the other side of the wire — the
frontend building `{message, tone, context}` JSON, the backend re-parsing it back into
labeled lines for Claude.

**Suggested fix:** two small shared helpers in the same file (or a `lib/` module if the
Amplify functions directory prefers that) — `parseWithFallback<T>(rawInput, fallback)`
for the try/catch, and `joinLabeledLines(lines: (string | undefined)[])` for the
filter+join. Each `buildXMessage` function shrinks to picking its own fields and labels;
the boilerplate around it stops being copy-pasted.

**Note:** `TONE_LABELS`/`VERBOSITY_LABELS` are already correctly *not* duplicated —
they're defined once and shared by the functions that need them. This finding is only
about the parse/assemble scaffolding around them.

### 3. The numbered-list step parser is duplicated, and inconsistently so

**Where:** `src/tools/taskBreakdown/index.tsx` and `src/tools/brainDumpSorter/index.tsx`
both define an identical `cleanStep`:

```ts
function cleanStep(step: string): string {
  return step.replace(/^\d+\.\s*/, '');
}
```

and an identical parsing pipeline:

```ts
output.split('\n').map((line) => line.trim()).filter(Boolean).map(cleanStep)
```

**A real inconsistency, not just duplication:** `src/tools/replyStarter/index.tsx`
solves the *same problem* (splitting Claude's numbered-list output into items) with a
different, more robust approach:

```ts
output.split(/\n(?=\d+[.)]\s)/).map((chunk) => chunk.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean)
```

Reply Starter's version splits on a lookahead for the *next* numbered item, so a reply
that happens to span multiple lines stays together as one item. Task
Breakdown/Brain Dump Sorter's line-by-line version would silently split a multi-line
step into two separate tasks. This hasn't bitten in practice (the prompts ask for
one-line steps), but it's a latent inconsistency between three call sites solving the
identical problem three different ways, two of which are strictly worse than the
third.

**Suggested fix:** promote Reply Starter's splitter to `src/lib/parseNumberedList.ts`
and have all three tools call it. This is a genuine behavior improvement for Task
Breakdown/Brain Dump Sorter (more robust to multi-line AI output), not just a
deduplication.

### 4. The signed-in/out sync lifecycle is duplicated wholesale between two contexts

**Where:** `src/context/RemindersContext.tsx` and `src/context/TaskStoreContext.tsx`.

**What's duplicated:** both contexts implement, almost line-for-line including
comments, the same four-part shape:
1. A `readStored`/`readStoredReminders` JSON-array-from-localStorage-with-fallback
   reader (`TaskStoreContext`'s is already generic; `RemindersContext` maintains its
   own non-generic copy of the identical function).
2. The combined sign-out-revert-and-mirror-to-localStorage effect, including the exact
   race-condition reasoning in the comment ("the sign-out transition itself is handled
   in this same effect... deliberately not as two separate effects").
3. An `observeQuery()` subscription effect that's only active when signed in.
4. A first-sign-in migration effect that uploads local data once, guarded by a
   `localStorage` flag.

This is the single largest piece of duplicated *behavior* in the codebase — not just
similar-looking lines, but the same distributed system design (optimistic local
state + backend reconciliation + migrate-once + never-leak-account-data-to-localStorage)
implemented twice.

**Why this one is harder than #1-#3:** each context's mutators (`addReminder` vs.
`addTask`/`addProject`) still have real per-model differences (Reminders has a
`checkReminders()` firing loop that Task Store doesn't; Task Store has two arrays and
model types instead of one). A full extraction risks becoming the "generic config
object nobody asked for" `CODING_GUIDELINES.md` §1 warns against.

**Suggested fix, scoped down to what's safely shareable:** don't try to unify the
whole provider — extract just the mechanical, model-agnostic pieces:
- `readStored<T>(key)` → already exists in `TaskStoreContext.tsx`; move it to a shared
  `src/lib/localStorage.ts` and have `RemindersContext` import it instead of keeping
  its own copy (this alone removes one exact duplicate with zero design risk).
- A small `useSignedOutMirror(value, storageKey, isSignedIn)` hook that owns just the
  "mirror to localStorage while signed out, revert to local on sign-out" effect —
  this part genuinely is identical in shape between the two contexts (write one array/
  value, not model-specific logic).
- Leave the `observeQuery` subscription and migration effects as they are for now —
  they're *close* in shape but reference different models/types, and a generic version
  would need real generics (`observeQuery<T>`, a mapper function per model) that starts
  to feel like the abstraction `CODING_GUIDELINES.md` cautions against building ahead
  of a third concrete need. Worth revisiting if a third context (e.g. a future
  per-user Distract Me setting, already on the "Phase 4+" list in
  `designs/user-personalization.md`) needs the exact same shape — that'd make it a
  genuine Rule-of-Three case instead of a two-instance one.

### 5. The double-click "sentRef" guard is duplicated three times, each with its own explanatory comment

**Where:** `taskBreakdown/index.tsx` (`sentRef`), `brainDumpSorter/index.tsx`
(`sentRef`), `sideQuestLog/index.tsx` (`promotedIdsRef`).

Each is a `useRef` that's checked-and-set synchronously at the top of a handler to
block a second invocation from a fast double-click, each with a comment explaining
*why* it has to be a ref and not state (a real, non-obvious constraint — good that it's
explained, per `CODING_GUIDELINES.md` §1's comment rule). But it's the same guard
pattern three times, and `sideQuestLog`'s version is shaped slightly differently (a
`Set` of already-promoted ids, since multiple entries can each be promoted once,
vs. the other two's single boolean for "has this whole batch been sent").

**Suggested fix:** a tiny shared hook:

```ts
// src/hooks/useOnceGuard.ts
export function useOnceGuard() {
  const firedRef = useRef(false);
  return {
    hasFired: () => firedRef.current,
    markFired: () => { firedRef.current = true; },
    reset: () => { firedRef.current = false; },
  };
}
```

for the single-shot case (Task Breakdown, Brain Dump Sorter), and keep Side Quest
Log's `Set`-based version as-is since it's a genuinely different shape (guarding N
independent items, not one batch) — forcing it into the same hook would be exactly
the kind of premature unification `CODING_GUIDELINES.md` warns against. This shrinks
two of the three call sites and writes the "why a ref" reasoning once instead of
twice.

### 6. The "structured fields, else raw text" result rendering is duplicated three times

**Where:** `toneChecker/index.tsx`, `callScript/index.tsx`, `isThisMad/index.tsx` each
have their own copy of:

```tsx
{hasStructuredResult && (
  <dl className="tool-result-fields"> {/* or call-script-fields */}
    {/* one <dt>/<dd> pair per non-empty field */}
  </dl>
)}
{output && !hasStructuredResult && <p className="tool-result-plain">{output}</p>}
```

**Suggested fix:** a shared presentational component,
`<StructuredResult fields={[{label, value}, ...]} rawOutput={output} />`, that
computes `hasStructuredResult` itself from whichever fields were passed in and renders
either the `<dl>` or the plain-text fallback. Lower priority than #1/#2 (it's
presentation, not logic — a bug here is visual, not a silent data-correctness issue),
but a real duplicate worth folding in if you're already touching these files for #1.

### 7. `normalizeDurationPhrases` doesn't use the same data-driven pattern the rest of the file already established

**Where:** `src/lib/reminderParser.ts`.

The file already has a clean, declarative pattern for "try a list of regexes, apply
the matching one's handler" — see `WARN_PATTERNS` and `REPEAT_PATTERNS`, both arrays
of `{ regex, toRule }` processed in a loop. But `normalizeDurationPhrases` — solving
the same *kind* of problem (try a pattern, transform the match) — is written as five
sequential, structurally-identical `.replace()` calls instead:

```ts
result = result.replace(/\bhalf\s+past\s+.../, (whole, hour) => { const h = wordToNumber(hour); return h === undefined ? whole : `${h}:30`; });
result = result.replace(/\bquarter\s+past\s+.../, (whole, hour) => { const h = wordToNumber(hour); return h === undefined ? whole : `${h}:15`; });
result = result.replace(/\bquarter\s+to\s+.../, (whole, hour) => { const h = wordToNumber(hour); if (h === undefined) return whole; return `${h <= 1 ? 12 : h - 1}:45`; });
```

**Suggested fix:** a small table, matching the file's own established convention:

```ts
const CLOCK_IDIOMS: { regex: RegExp; toTime: (hour: number) => string }[] = [
  { regex: new RegExp(`\\bhalf\\s+past\\s+(${hourPattern})\\b`, 'gi'), toTime: (h) => `${h}:30` },
  { regex: new RegExp(`\\bquarter\\s+past\\s+(${hourPattern})\\b`, 'gi'), toTime: (h) => `${h}:15` },
  { regex: new RegExp(`\\bquarter\\s+to\\s+(${hourPattern})\\b`, 'gi'), toTime: (h) => `${h <= 1 ? 12 : h - 1}:45` },
];
```

processed with the same `for`/`.replace` loop shape `WARN_PATTERNS` already uses. Pure
readability/consistency win — this file already proved the pattern works well for
exactly this kind of problem two sections above.

---

## SRP / "god component" concerns

### 8. `EverythingPile` (in `everythingPile/index.tsx`) does too much in one component

**Where:** `src/tools/everythingPile/index.tsx` — ~340 lines, one component function.

It currently owns: project CRUD, task CRUD, project↔task conversion (both
directions), the Task Breakdown handoff, expand/collapse state, and two full inline
edit forms (project rename, task edit) — all in one `EverythingPile()` function with
one large JSX return. `AddTaskRow` and `SizeToggle` are already correctly extracted as
their own components (good instinct, already applied); the task-group header, the
task list item, and the two inline edit forms are not.

**Why it matters (`CODING_GUIDELINES.md` §2, §3):** this is the file most likely to
get harder to safely change over time — a small edit to, say, the task-item row risks
touching code that's visually adjacent to five unrelated concerns in the same return
statement. It's not *broken*, and splitting it is genuinely a judgment call on where
the right seams are (this is exactly the kind of discussion worth having together
rather than a mechanical fix) — flagging it here rather than prescribing an exact
decomposition.

**Possible seams, for discussion, not a prescription:** a `TaskGroupHeader` component
(the button + 🧩/📤/✎/× row), a `TaskListItem` component (the `editingTaskId === task.id
? <form> : <display>` branch), and possibly a `useTaskGroups()` helper that computes
the `groups` array — each currently a distinct, nameable piece of the same function.

---

## Minor smells (lower priority, worth a quick pass)

- **9. `updateTask`'s inline destructure-and-conditional-spread is hard to read at a
  glance** (`TaskStoreContext.tsx`):
  ```ts
  const { projectId, ...rest } = patch;
  client.models.Task.update({ id, ...rest, ...('projectId' in patch ? { projectId: projectId ?? null } : {}) })
  ```
  Correct, and the comment explains *why*, but per `CODING_GUIDELINES.md` §1 ("if a
  one-liner needs a comment to explain what it does, it's usually clearer as three
  lines that don't") — a small named helper, e.g. `toTaskUpdatePatch(id, patch)`
  returning the same object, would let the comment become a docstring on a testable
  function instead of an inline aside.

- **10. `SOUNDS.find(...)` duplicated in two places** — `DistractMeContext.play()` and
  `NowPlayingBar.tsx` both look up the active sound by id from the same `SOUNDS`
  array. Trivial (one line, one array), but since `DistractMeContext` already exposes
  `activeSoundId`, it could just as easily expose the resolved `SoundOption` directly
  and remove the second lookup entirely.

- **11. `Boolean(badgeCount)` repeated twice in `ToolCard.tsx`** — computing it once
  into a local `hasBadge` at the top of the component would remove the duplicate
  coercion and make the two conditional blocks slightly easier to scan.

---

## Not smells — flagging so they don't get "fixed" by accident

A few things that look like they *could* be simplified but are already the
deliberately-chosen shape, per the file's own comments and `CODING_GUIDELINES.md`:

- The **ref-based double-click guards** (#5 above) look like they could just be a
  `disabled` prop — they can't; a fast double-click can fire both handlers before
  React re-renders a disabled button. Keep the ref.
- The **combined sign-out-revert-and-mirror effect** in both `RemindersContext` and
  `TaskStoreContext` looks like it could split into two effects for readability —
  it can't, without reintroducing the exact race the single-effect design
  deliberately avoids (documented in both files' comments).
- The **long, repetitive-looking system prompts** in `ai-assist/handler.ts` are not a
  code smell — prompt engineering has different economics than code (explicitness
  usually improves model reliability), and shortening them isn't a code-quality
  question in the same sense as the sections above.
- **Per-tool `JSON.stringify`'d multi-field payloads** (Reply Starter, Call Script,
  Tone Checker, Is This Mad?) look like they could share one generic envelope type —
  they're deliberately not unified (see `README.md`'s "Adding a new tool": each tool
  registers its own builder in `USER_MESSAGE_BUILDERS`), and forcing a shared input
  shape across tools with genuinely different fields would be the "generic config
  object" anti-pattern, not a simplification.

---

## Suggested order to work through this

1. **#1 and #2** (frontend/backend labeled-parser duplication) — safest, most
   mechanical, highest duplication-removed-per-line-changed. Good first PR.
2. **#3** (numbered-list parser) — also mechanical, and fixes a real (if
   currently dormant) robustness gap while deduplicating.
3. **#5** (double-click guard hook) — small, safe, removes two of three copies.
4. **#7** (clock-idiom table) — pure readability, zero behavior change, contained to
   one file.
5. **#4** (context lifecycle duplication) — worth a real discussion before touching;
   the scoped-down version (just `readStored`, just the mirror-effect hook) is safe;
   the full unification is not recommended yet.
6. **#8** (`EverythingPile` decomposition) — worth discussing the right seams before
   starting; no urgency, the file works correctly today.
7. **#6, #9, #10, #11** — pick up opportunistically whenever you're already touching
   the relevant file, per `CODING_GUIDELINES.md`'s "bring existing code into line
   opportunistically" guidance.
