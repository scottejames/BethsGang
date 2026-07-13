# Code Smell Review

**Status: resolved 2026-07-13.** All 13 findings below were worked through and fixed the
same day this refresh was written — see `CHANGELOG.md`'s 2026-07-13 entry for what
actually changed. Left in place as a record of what the codebase looked like and why
each fix was made, not as an open list anymore. A future review should start fresh
rather than treating anything below as still-pending.

A read-through of the whole `src/`/`amplify/` codebase against `CODING_GUIDELINES.md`,
with an explicit focus on simplification. **No code was changed** — this is a list to
work through together, not a patch. Each finding is numbered for easy reference in
discussion, tagged with the guideline section it relates to, and rated for how safe/
mechanical the fix would be.

Methodology: read every non-test `.ts`/`.tsx` file in `src/` and `amplify/` in full
(not a diff or a sample), cross-referencing repeated shapes across files rather than
judging each file in isolation — most of what's below only becomes visible once you've
read three or four tools back to back and start noticing the same twenty lines again.

**2026-07-13 update:** this is a refresh of the 2026-07-10 review. Six tools/features
shipped since then — Study Help (Essay Phrase Bank, Assignment Breakdown, Essay
Structure Planner), Timetable, How Long Will This Take? (Time Estimator), and Cook's
Corner — plus the PWA install work. Every original finding was re-checked against the
current code; none have been fixed yet, and four of them (marked **↑** below) picked up
new instances in the tools that shipped since, which is worth knowing before deciding
where to start. One finding (#4) crossed a real threshold: a pattern the last review
deliberately left alone specifically because it only had two instances now has a third,
which the last review itself flagged as the condition for revisiting it.

---

## Top simplification opportunities

These are ranked by **impact × safety** — how much duplicated knowledge it removes,
versus how mechanical/low-risk the extraction would be.

### 1. Five contexts/tools hand-roll the identical "read a JSON array from localStorage" reader **↑**

**Where:** `TaskStoreContext.tsx` (`readStored<T>` — already generic, the one good copy),
`RemindersContext.tsx` (`readStoredReminders`), `TimetableContext.tsx`
(`readStoredEntries`), `sideQuestLog/index.tsx` (`loadEntries`), `dopamineMenu/index.tsx`
(`loadItems`).

**What's duplicated:** this exact block, byte-for-byte identical except for the type
parameter, in all five files:

```ts
try {
  const stored = window.localStorage.getItem(KEY);
  if (!stored) return [];
  const parsed = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
} catch {
  return [];
}
```

`dopamineMenu`'s `loadItems` is the one real variation — it seeds `DEFAULT_ITEMS` on a
genuinely missing key (`stored === null`) versus an explicit empty array — but the core
read-and-fall-back logic is identical to the other four.

**Why this is now the top item:** the 2026-07-10 review only had two instances of this
(`TaskStoreContext`, `RemindersContext`) and filed it as a sub-point of a much harder
finding (#4 below) about the whole signed-in/out lifecycle. Since then, three more tools
each wrote their own copy instead of reaching for the one that already existed and is
already generic. This is now the single most duplicated exact block in the codebase —
five instances, near-zero design risk to fix (unlike #4's mutators, `readStored<T>` has
no per-model differences to protect), and two of the five instances (`sideQuestLog`,
`dopamineMenu`) don't even have a backend-sync story, so extracting it doesn't wait on
resolving #4 at all.

**Suggested fix (safe, mechanical):** move `readStored<T>` out of `TaskStoreContext.tsx`
into `src/lib/localStorage.ts` unchanged, and have all five call sites import it. Purely
a cut-paste-import job — no behavior changes anywhere, since all five bodies are already
identical (`dopamineMenu` keeps its own seeding decision as a thin wrapper around the
shared reader: `stored === null ? DEFAULT_ITEMS.map(...) : readStored<DopamineItem>(KEY)`).

### 2. Four tools hand-roll the identical "labeled-field" parser **↑**

**Where:** `src/tools/toneChecker/index.tsx` (`parseResult`), `src/tools/callScript/index.tsx`
(`parseScript`), `src/tools/isThisMad/index.tsx` (`parseResult`), and now also
`src/tools/timeEstimator/index.tsx` (`parseResult`, shipped since the last review).

**What's duplicated:** this exact block, byte-for-byte identical in all four files:

```ts
const lines = output.split('\n').map((line) => line.trim());
const get = (label: string) =>
  lines.find((line) => line.toLowerCase().startsWith(label.toLowerCase()))?.slice(label.length).trim();
```

Each tool then calls `get('Tone:')`, `get('Realistic estimate:')`, etc. with its own
labels. `isThisMad` additionally has its own bullet-list extractor (`asksIndex`/`asks`)
bolted onto the same pattern, which is itself a generalizable "get everything after
label X that starts with `-`" operation.

**Why it matters:** this is exactly the "DRY is about knowledge" case from
`CODING_GUIDELINES.md` §1 — all four tools share the actual *algorithm* for parsing
Claude's structured plain-text output, not just similar-looking code. Time Estimator
shipping with its own fifth-generation copy of this exact block, rather than reaching
for a shared one, is a live example of the cost of leaving this unfixed: every new
AI-backed tool with a labeled-field response is now more likely to copy the pattern than
to notice it's a pattern.

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
of four.

### 3. Seven backend message builders duplicate the same JSON-parse-and-assemble shape **↑**

**Where:** `amplify/functions/ai-assist/handler.ts` — `buildReplyStarterMessage`,
`buildToneCheckerMessage`, `buildCallScriptMessage`, `buildIsThisMadMessage`, and now
also `buildAssignmentBreakdownMessage`, `buildEssayStructureMessage`,
`buildCooksCornerMessage` (all three shipped since the last review).

**What's duplicated:** all seven follow the identical shape:

```ts
let parsed: Partial<SomeInput>;
try {
  parsed = JSON.parse(rawInput);
} catch {
  parsed = { message: rawInput }; // or { instructions: rawInput }, { description: rawInput }, { fridgeItems: rawInput }...
}
const message = parsed.message ?? rawInput;
// ...pick a few optional fields...
return [/* labeled lines */].filter((line): line is string => Boolean(line)).join('\n\n');
```

This is the same class of duplication as #2, just on the other side of the wire — the
frontend building `{message, tone, context}`-shaped JSON, the backend re-parsing it back
into labeled lines for Claude.

**Why this moved up:** seven of this file's now-eight message builders share this exact
scaffolding (the eighth, `buildScreenshotToTextContent`, is genuinely different — it
returns content blocks, not a string, so it's correctly not part of this). At seven
instances in one file, this is no longer "a few similar functions" — it's a convention
every new tool's builder is expected to reimplement by eye from the previous one, with
the only variation being which field is the fallback and which fields get labeled.

**Suggested fix:** two small shared helpers in the same file (or a `lib/` module if the
Amplify functions directory prefers that) — `parseWithFallback<T>(rawInput, fallbackKey)`
for the try/catch, and `joinLabeledLines(lines: (string | undefined)[])` for the
filter+join. Each `buildXMessage` function shrinks to picking its own fields and labels;
the boilerplate around it stops being copy-pasted.

**Note:** `TONE_LABELS`/`VERBOSITY_LABELS` are already correctly *not* duplicated —
they're defined once and shared by the functions that need them. This finding is only
about the parse/assemble scaffolding around them.

### 4. The signed-in/out sync lifecycle is now duplicated **three times** — this crossed the threshold the last review set for revisiting it **↑**

**Where:** `src/context/RemindersContext.tsx`, `src/context/TaskStoreContext.tsx`, and
now also `src/context/TimetableContext.tsx` (shipped since the last review).

**What's duplicated:** all three contexts implement, almost line-for-line including
comments, the same four-part shape:
1. A JSON-array-from-localStorage-with-fallback reader (see #1 above).
2. The combined sign-out-revert-and-mirror-to-localStorage effect, including the exact
   race-condition reasoning in the comment ("the sign-out transition itself is handled
   in this same effect... deliberately not as two separate effects") — `TimetableContext`
   copies this comment nearly verbatim, explicitly citing `RemindersContext`'s version.
3. An `observeQuery()` subscription effect that's only active when signed in.
4. A first-sign-in migration effect that uploads local data once, guarded by a
   `localStorage` flag.

**Why this is the one real change since the last review:** the 2026-07-10 review looked
at exactly this duplication with two instances and explicitly declined to recommend
unifying the `observeQuery`/migration effects, reasoning that "a generic version would
need real generics... that starts to feel like the abstraction `CODING_GUIDELINES.md`
cautions against building ahead of a third concrete need" — and named the specific
condition that would change that verdict: *"Worth revisiting if a third context... needs
the exact same shape — that'd make it a genuine Rule-of-Three case instead of a
two-instance one."* `TimetableContext` is now exactly that third context, needing
exactly that shape (its own comments say as much). This is worth an explicit
conversation rather than either extreme — leaving it as three independent copies, or
reaching for full generics — since `CODING_GUIDELINES.md` §1's DRY principle ("DRY is
about knowledge, not text") still applies: the question isn't just "is this the third
copy" but "would a fourth context (a real one is already flagged as possible —
`designs/user-personalization.md`'s Phase 4+ per-user Distract Me settings) share the
same *reason to change* as these three, or would it need its own special case the moment
it's added."

**Suggested fix, scoped down to what's safely shareable regardless of the above:**
- `readStored<T>(key)` → see #1; this alone removes three exact duplicates with zero
  design risk, independent of what happens with the rest of this finding.
- A small `useSignedOutMirror(value, storageKey, isSignedIn)` hook that owns just the
  "mirror to localStorage while signed out, revert to local on sign-out" effect — this
  part is genuinely identical in shape across all three contexts now (write one array/
  value, not model-specific logic), and with three real instances this is squarely a
  Rule-of-Three case, not a premature one.
- **Worth a real discussion, not a mechanical fix:** whether the `observeQuery`
  subscription + migration effects are now also ready to unify (e.g. a
  `useBackendSyncedList<T>(model, isSignedIn, { toBackendInput, fromBackendItem })`
  hook), given there are three concrete shapes to generalize from instead of guessing at
  a shape ahead of time. Each context's own mutators (`addReminder` vs. `addTask`/
  `addProject` vs. `addEntry`) should stay separate regardless — they have real
  per-model differences (Reminders' `checkReminders()` firing loop, Task Store's two
  models, Timetable's day-of-week grouping) that a shared hook shouldn't try to absorb.

### 5. The numbered-list step parser is duplicated across four tools, and inconsistently so **↑**

**Where:** `src/tools/taskBreakdown/index.tsx`, `src/tools/brainDumpSorter/index.tsx`,
and now also `src/tools/assignmentBreakdown/index.tsx` (`cleanStep`) and
`src/tools/essayStructurePlanner/index.tsx` (`cleanHeading` — same body, different name)
all define the identical function:

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
that happens to span multiple lines stays together as one item. The other four tools'
line-by-line version would silently split a multi-line step into two separate tasks.
This hasn't bitten in practice (the prompts ask for one-line steps/headings), but two
more tools have now shipped with the strictly-worse version rather than the one already
proven in the codebase.

**Suggested fix:** promote Reply Starter's splitter to `src/lib/parseNumberedList.ts`
and have all five tools call it. This is a genuine behavior improvement for the four
line-by-line tools (more robust to multi-line AI output), not just a deduplication.

### 6. The double-click "sentRef" guard is now duplicated five times **↑**

**Where:** `taskBreakdown/index.tsx` (`sentRef`), `brainDumpSorter/index.tsx`
(`sentRef`), `essayStructurePlanner/index.tsx` (`sentRef`, new since last review),
`assignmentBreakdown/index.tsx` (`sentRef`, new since last review), and
`sideQuestLog/index.tsx` (`promotedIdsRef` — genuinely different shape, see below).

Each is a `useRef` that's checked-and-set synchronously at the top of a handler to
block a second invocation from a fast double-click, each with a comment explaining
*why* it has to be a ref and not state (a real, non-obvious constraint — good that it's
explained, per `CODING_GUIDELINES.md` §1's comment rule). Four of the five
(`taskBreakdown`, `brainDumpSorter`, `essayStructurePlanner`, `assignmentBreakdown`) are
now the exact same single-boolean "has this whole batch been sent" shape.
`sideQuestLog`'s version is still shaped differently — a `Set` of already-promoted ids,
since multiple entries can each be promoted independently — and should stay separate.

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

for the four single-shot call sites, and keep Side Quest Log's `Set`-based version as-is
— forcing it into the same hook would be exactly the kind of premature unification
`CODING_GUIDELINES.md` warns against. This shrinks four of the five call sites (up from
two of three at the last review) and writes the "why a ref" reasoning once instead of
four times.

### 7. The "structured fields, else raw text" result rendering is duplicated across five tools **↑**

**Where:** `toneChecker/index.tsx`, `callScript/index.tsx`, `isThisMad/index.tsx`,
`timeEstimator/index.tsx` (new since last review), and `cooksCorner/index.tsx`'s recipe
card (new since last review, close enough in shape to count) each have their own copy of:

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
either the `<dl>` or the plain-text fallback. Lower priority than #1-#3 (it's
presentation, not logic — a bug here is visual, not a silent data-correctness issue),
but with five instances now (up from three) it's a real duplicate worth folding in if
you're already touching these files for #2. Cook's Corner's meal-idea list and recipe
list are genuinely tool-specific beyond this shared shell (its own bullet/numbered
sub-lists), so this component should wrap the `<dl>` shell only, not try to also own
tool-specific list rendering.

### 8. `normalizeDurationPhrases` doesn't use the same data-driven pattern the rest of the file already established

**Where:** `src/lib/reminderParser.ts`. Unchanged since the last review.

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

### 9. `EverythingPile` does too much in one component — and has grown since the last review

**Where:** `src/tools/everythingPile/index.tsx` — now ~487 lines (was ~340 at the last
review), still one component function.

It owns: project CRUD, task CRUD, project↔task conversion (both directions), the Task
Breakdown handoff, expand/collapse state, and two full inline edit forms (project
rename, task edit) — all in one `EverythingPile()` function with one large JSX return.
`AddTaskRow` and `SizeToggle` are already correctly extracted as their own components
(good instinct, already applied); the task-group header, the task list item, and the two
inline edit forms are not.

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

- **10. `updateTask`'s inline destructure-and-conditional-spread is hard to read at a
  glance** (`TaskStoreContext.tsx`, unchanged):
  ```ts
  const { projectId, ...rest } = patch;
  client.models.Task.update({ id, ...rest, ...('projectId' in patch ? { projectId: projectId ?? null } : {}) })
  ```
  Correct, and the comment explains *why*, but per `CODING_GUIDELINES.md` §1 ("if a
  one-liner needs a comment to explain what it does, it's usually clearer as three
  lines that don't") — a small named helper, e.g. `toTaskUpdatePatch(id, patch)`
  returning the same object, would let the comment become a docstring on a testable
  function instead of an inline aside.

- **11. `SOUNDS.find(...)` duplicated in two places** — `DistractMeContext.play()` and
  `NowPlayingBar.tsx` both look up the active sound by id from the same `SOUNDS`
  array. Unchanged since the last review. Trivial (one line, one array), but since
  `DistractMeContext` already exposes `activeSoundId`, it could just as easily expose
  the resolved `SoundOption` directly and remove the second lookup entirely.

- **12. `Boolean(badgeCount)` repeated twice in `ToolCard.tsx`** — unchanged since the
  last review. Computing it once into a local `hasBadge` at the top of the component
  would remove the duplicate coercion and make the two conditional blocks slightly
  easier to scan.

- **13. Copy-to-clipboard-with-a-1.5s-reset is duplicated between two tools (new).**
  `essayPhraseBank/index.tsx`'s `handleCopy` and `replyStarter/index.tsx`'s `handleCopy`
  are structurally identical: `try { await navigator.clipboard.writeText(...); setX(id);
  setTimeout(() => setX((current) => current === id ? null : current), 1500); } catch
  {}` — differing only in what "id" means (a phrase string vs. a numeric index) and both
  with the identical "clipboard unavailable, phrase/reply is still visible to copy by
  hand" comment. A small `useCopyFeedback<T>()` hook (mirroring `useOnceGuard`'s shape in
  #6) returning `{ copied, copy(value: T) }` would collapse both. Low priority — it's two
  instances, not a Rule-of-Three case yet — but worth naming now that essayPhraseBank
  is the second copy rather than a novel pattern.

---

## Not smells — flagging so they don't get "fixed" by accident

A few things that look like they *could* be simplified but are already the
deliberately-chosen shape, per the file's own comments and `CODING_GUIDELINES.md`:

- The **ref-based double-click guards** (#6 above) look like they could just be a
  `disabled` prop — they can't; a fast double-click can fire both handlers before
  React re-renders a disabled button. Keep the ref.
- The **combined sign-out-revert-and-mirror effect** in `RemindersContext`,
  `TaskStoreContext`, and now `TimetableContext` looks like it could split into two
  effects for readability — it can't, without reintroducing the exact race the
  single-effect design deliberately avoids (documented in all three files' comments,
  and `AlertBanner.tsx`'s merge of Reminders' and Timetable's alert stacks is itself a
  correctly-identified Rule-of-Three case per its own comment, not a premature one).
- The **long, repetitive-looking system prompts** in `ai-assist/handler.ts` are not a
  code smell — prompt engineering has different economics than code (explicitness
  usually improves model reliability), and shortening them isn't a code-quality
  question in the same sense as the sections above. This file now has eight prompts
  (three new since the last review); the observation still holds for all of them.
- **Per-tool `JSON.stringify`'d multi-field payloads** (Reply Starter, Call Script,
  Tone Checker, Is This Mad?, and now Assignment Breakdown, Essay Structure Planner,
  Cook's Corner) look like they could share one generic envelope type — they're
  deliberately not unified (see `README.md`'s "Adding a new tool": each tool registers
  its own builder in `USER_MESSAGE_BUILDERS`), and forcing a shared input shape across
  tools with genuinely different fields would be the "generic config object"
  anti-pattern, not a simplification. (The *scaffolding* around each builder is the
  real duplication — see #3.)
- **Cook's Corner's bespoke `parseMealIdeas`/`parseRecipes`** look at first glance like
  they should reuse #2's labeled-field getter — they shouldn't. Their input shape
  (numbered list with an inline `(Shop: ...)` suffix; blank-line-separated
  `Recipe:`/`Ingredients:`/`Method:` blocks) is genuinely different from the flat
  `Label: value` lines #2 covers, and forcing it through `makeLabelGetter` would
  distort both. Correctly tool-specific.

---

## Suggested order to work through this

1. **#1** (shared `readStored<T>`) — the safest, most mechanical item in this whole
   list: five files, zero behavior change, no design judgment calls. Good first PR.
2. **#2 and #3** (frontend/backend labeled-parser duplication) — also mechanical, high
   duplication-removed-per-line-changed.
3. **#5** (numbered-list parser) — mechanical, and fixes a real (if currently dormant)
   robustness gap while deduplicating.
4. **#6** (double-click guard hook) — small, safe, removes four of five copies.
5. **#8** (clock-idiom table) — pure readability, zero behavior change, contained to
   one file.
6. **#4** (context lifecycle duplication) — worth a real discussion now that it's a
   genuine three-instance case; the scoped-down version (`readStored`, plus the mirror-
   effect hook) is safe on its own, the `observeQuery`/migration unification is a design
   call worth making together rather than defaulting either way.
7. **#9** (`EverythingPile` decomposition) — worth discussing the right seams before
   starting; no urgency, the file works correctly today.
8. **#7, #10, #11, #12, #13** — pick up opportunistically whenever you're already
   touching the relevant file, per `CODING_GUIDELINES.md`'s "bring existing code into
   line opportunistically" guidance.
