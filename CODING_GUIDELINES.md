# Coding Guidelines

Prescriptive, forward-looking rules for writing code in this repo — as opposed to
`designs/design-principles.md`, which is retrospective (*why* past decisions were
made). This document is normative: follow it for new code, and bring existing code
into line with it opportunistically when you're already touching a file, not as a
dedicated pass.

Scope: this repo's actual stack — **React 19 + TypeScript + Vite** (frontend),
**AWS Amplify Gen2** (`amplify/data`, `amplify/auth`, `amplify/functions` — the
backend), and **Vitest + React Testing Library + Playwright** (verification). Every
principle below is illustrated with a real example already in this codebase where
one exists, rather than a generic snippet, so this stays checkable against the code
instead of just aspirational.

## 1. General principles (apply to everything)

- **Prefer the smallest thing that solves the named problem.** No speculative
  flexibility, no config options nobody asked for, no abstraction built for a second
  use case that doesn't exist yet. Three similar lines across two tools is better
  than a shared helper extracted for them — see `designs/design-principles.md`'s
  "Ship simple, add flexibility from real feedback" for the product-level version of
  this same rule.
- **Optimize for the next reader, not for cleverness.** A junior engineer or a future
  you, six months on, should be able to read a function top to bottom and understand
  it without reaching for a debugger. If a one-liner needs a comment to explain what
  it does, it's usually clearer as three lines that don't.
- **Comments explain *why*, never *what*.** Well-named identifiers already say what
  the code does. A comment earns its place only when it records a non-obvious
  constraint, a workaround for a specific bug, or a reason a reader would otherwise
  have to reverse-engineer — see almost any comment in `TaskStoreContext.tsx` or
  `RemindersContext.tsx` for the standard this repo already holds itself to.
- **DRY is about knowledge, not text.** Two pieces of code that look similar but
  change for unrelated reasons should stay separate, even if that means some
  duplication. Only unify code whose *reason to change* is genuinely the same.
- **YAGNI beats extensibility theater.** Don't add a plugin system, a strategy
  pattern, or a generic config object for a requirement that's currently exactly
  one case. Every tool in `src/tools/` still only needs a `meta.ts` + `index.tsx` —
  resist the urge to make that framework "more flexible" ahead of an actual second
  need for the flexibility.

## 2. SOLID, adapted to functional TypeScript/React

SOLID was written for class-based OOP; this codebase has no classes outside
generated SDK internals. The principles still apply — just to functions, hooks, and
modules instead of classes. Treat "a class" below as "a function, hook, or module."

- **S — Single Responsibility.** A function, hook, or component should have one
  reason to change. `TaskStoreContext`'s `addTask`/`updateTask`/`deleteTask` are each
  a few lines doing exactly one thing; `useAiTool` only knows how to call a tool and
  track loading/error/output, nothing about what any specific tool's input looks
  like. If a function's name needs "and" to describe it, split it.
- **O — Open/Closed.** Prefer extension over modification. This repo's tool registry
  is the canonical example: adding a tool means creating a new folder and one line in
  `registry.ts` — `Home.tsx`, `App.tsx`, and every other tool are untouched. When
  adding a new case to an existing concept (a new AI tool, a new `ToolCategory`),
  look for the place that's already designed to be extended before editing
  unrelated call sites.
- **L — Liskov Substitution.** Anything implementing a shared shape must be usable
  everywhere that shape is expected, without surprising the caller. Every
  `ToolDefinition` (`meta` + `Component`) renders and navigates identically from
  `registry.ts`'s point of view, whether the tool is AI-backed or pure client-side —
  `App.tsx` never needs to know which. If a new implementation of an existing
  interface needs a special case at the call site, the interface is wrong, not just
  the new implementation.
- **I — Interface Segregation.** Depend on the narrowest shape that does the job, not
  a fat one with unused fields. `ToolMeta` carries exactly `id`, `name`, `tagline`,
  `icon`, `category` — nothing a tool doesn't need. A component that only needs to
  call `addTask` shouldn't have to import all of `TaskStoreContext`'s surface if a
  narrower hook would do; don't force a caller to depend on nine props to use one.
- **D — Dependency Inversion.** Components should depend on an abstraction (a hook,
  a context), not the concrete implementation underneath it. No tool component calls
  `generateClient()` or `fetch` directly — they call `useTaskStore()`, `useAiTool()`,
  `useReminders()`. That's what let the entire Shared Task Store move from
  `localStorage` to DynamoDB (`designs/user-personalization.md`'s "What Phase 3
  built") without a single tool component changing — they only ever depended on the
  hook's abstraction, never on how it was implemented.

## 3. React + TypeScript conventions

- **Strict mode, always.** `tsconfig.app.json` already has `noUnusedLocals`,
  `noUnusedParameters`, and friends on — don't relax these to make an error go away;
  fix the actual unused code or parameter.
- **Function components + hooks only.** No class components anywhere in this repo;
  don't introduce one.
- **Type props and state explicitly**, especially when a value can be `null`/
  `undefined` — see `TaskEditDraft`, `AddTaskInput` in `TaskStoreContext.tsx` for the
  house style: a plain `interface`, no unnecessary generics.
- **Hooks only at the top level, never inside a condition or loop** — this is a React
  rule, not a style preference; breaking it produces silent, hard-to-debug state bugs.
- **Prefer a `Set`/`Map` keyed lookup over `.find()` in a loop** when a value is
  checked repeatedly against a growing collection (see `expandedGroupIds` in
  `everythingPile/index.tsx`).
- **Optimistic local update, then reconcile** for anything backed by a network call:
  update React state immediately so the UI feels instant, fire the network call
  without blocking on it, and let the source of truth (an `observeQuery()` emission,
  or a `.catch()` that logs and leaves state as-is) reconcile afterward. Every
  context in `src/context/` that talks to Amplify Data follows this shape — don't
  introduce a spinner-then-wait pattern for a write that doesn't need one.
- **Guard double-submission with a `useRef`, not a state check or a `disabled` prop
  alone.** Two fast click handlers can both run before React re-renders a disabled
  button, so a state-based guard can still see the stale pre-click value. See the
  `sentRef`/`promotedIdsRef` guards in `taskBreakdown/index.tsx`,
  `brainDumpSorter/index.tsx`, and `sideQuestLog/index.tsx` for the pattern — flip
  the ref synchronously as the very first line of the handler, before anything else
  runs.
- **Pick the correct ARIA role for what a control actually does** — a set of
  mutually exclusive toggle buttons that just filter a view is `role="group"` with
  `aria-pressed` per button, not `role="tablist"`/`"tab"` unless you also implement
  the arrow-key navigation and `aria-controls` that pattern implies. Getting this
  wrong reads fine visually but is actively misleading to assistive tech — see
  `Home.tsx`'s category toggle for the corrected version of this exact mistake.

## 4. State management & Context

- **A Context should do one job.** `EnergyContext` only knows Spoons;
  `RemindersContext` only knows reminders/fired events. Don't fold unrelated state
  into an existing provider because it's convenient — add a new context (see
  `designs/architecture-overview.md`'s persistent-provider pattern for how this
  project already extends the pattern one provider at a time).
- **Mount persistent providers once, at the app root** (`main.tsx`), not inside the
  tree of whichever tool happens to need them — this is what lets Distract Me's
  audio, Reminders' timers, and the Task Store all keep working while the user
  navigates to an unrelated tool.
- **Memoize a context's value only when the provider re-renders often and the value
  identity matters to consumers** — don't reach for `useMemo` on every context by
  default; this codebase's providers re-render infrequently enough that it hasn't
  been a real problem yet. Reach for it when it demonstrably is.
- **Split state that changes for different reasons into different contexts**, even
  if they're logically related. Task Store's `activeCategory` (which tab was
  showing) was deliberately moved into `ToolNavigationContext`, not bundled into
  `TaskStoreContext`, because it changes for a different reason (navigation, not
  task data) and needed to survive a different lifecycle event (Home unmounting).
- **A context's hook must throw if used outside its provider** — every `useX()` in
  this repo (`useTaskStore`, `useAuth`, `useEnergy`, ...) throws a specific "must be
  used within a ...Provider" error rather than silently returning `null`. Keep doing
  this; a silent `null` return defers the failure to a confusing crash somewhere
  else entirely.

## 5. AWS Amplify Gen2 (backend)

- **Deny-by-default, and the most specific rule wins.** Every model must declare its
  own `.authorization(...)` — never rely on `defaultAuthorizationMode` alone for a
  model that needs different rules than `runAiTool`/`logEvent`'s public API key (see
  `amplify/data/resource.ts`).
- **Set `authMode` explicitly on any client used against an owner-scoped model.** The
  generated Data client's default `authMode` follows the *schema's*
  `defaultAuthorizationMode`, not a specific model's own rule — a client call against
  an `allow.owner()` model without an explicit `authMode: 'userPool'` is rejected
  server-side with a silent "Not Authorized" that looks fine in the UI (see
  `src/lib/dataClient.ts`'s comment, and `designs/user-personalization.md`'s "What
  Phase 2 built" for the real incident this caused).
- **Keep secrets server-side, always.** The Anthropic API key lives only as an
  Amplify secret injected into the `ai-assist` Lambda's environment — it is never
  read from a frontend env var, never bundled, never logged. Don't add a new
  secret-consuming call from frontend code; route it through a Lambda.
  Build-time frontend env vars are not secret — anything in a Vite `import.meta.env`
  value ships in the bundle.
- **Prefer a plain string field over a GraphQL enum for a value that might evolve**,
  the same way `Task.category`/`Task.size` and `Reminder.repeat` are plain strings —
  a GraphQL enum can't hold a value with a hyphen (`'not-your-problem'` would be
  illegal), and changing an enum's members is a breaking schema change in a way a
  string field's accepted values are not.
- **A client-generated id, set explicitly on `create()`,** is what makes optimistic
  updates and idempotent migration retries possible — see every `addX` function in
  `TaskStoreContext.tsx`/`RemindersContext.tsx` calling `crypto.randomUUID()` itself
  rather than waiting for the backend to assign one.
- **A relation you don't need referential integrity for should be a plain field, not
  `belongsTo`/`hasMany`.** `Task.projectId` is a plain optional string specifically so
  deleting a project can detach its tasks (not cascade-delete them) using ordinary
  application logic, instead of fighting a relation's own delete policy.

## 6. Testing (Vitest + Testing Library + Playwright)

- **Test behavior, not implementation.** Query by role, label, or visible text
  (`getByRole`, `getByLabelText`) — not by CSS class or a test-only id — so a test
  keeps passing through a refactor that doesn't change what the user sees or does.
- **Wrap a test in the real providers the component actually depends on, mocking only
  the network/auth edges** (`aws-amplify/auth`, `aws-amplify/utils`'s `Hub`, and
  `../lib/dataClient`'s `client` where a backend call is exercised) — not a fake
  version of your own context. This is why every context test in this repo composes
  the real `AuthProvider`/`EnergyProvider`/etc. rather than stubbing `useAuth`.
- **A guard against a race (double-click, Strict Mode double-invoke) deserves a
  regression test that reproduces the race**, not just a test of the happy path —
  see `pomodoroTimer/index.test.tsx`'s fake-timer test for the double-pop-sound bug,
  and the double-send tests added alongside the `sentRef` guards above.
- **Reproduce a cross-mount bug by actually mounting/unmounting the component under
  test, in one shared provider tree with `rerender()`** — two separate `render()`
  calls each get a fresh, disconnected provider tree and will not reproduce a bug
  that only exists because state survives (or fails to survive) a remount. See
  `Home.test.tsx`'s tab-persistence tests for the pattern.
- **Verify an AI-backed tool's plain-text output parsing with intercepted
  Playwright network responses** (`page.route`), not just a live sandbox call — the
  format-guard bug in `designs/ai-assist-tools.md` is exactly the class of bug this
  catches early.
- **When you find yourself manually testing the same thing twice, write it down as a
  real test instead.**

## 7. Error handling

- **Fire-and-forget backend writes get a `.catch(console.error)`, not a silent
  swallow and not a re-thrown exception that would crash an optimistic update
  already shown to the user.** The UI has already moved on; log the failure for
  diagnosis rather than surfacing a disruptive error for something the user can't
  act on in the moment.
- **A user-initiated action that can fail (an AI call, a sign-in) gets a real error
  state surfaced in the UI**, with a plain-language fallback message — see
  `useAiTool.ts`'s `catch` block — not a console-only log the user never sees for
  something they're actively waiting on.
- **Never let a caught error be silently discarded with an empty `catch {}`** unless
  the comment directly above it explains why swallowing it is correct (see
  `readStored`'s `catch { return []; }` in `TaskStoreContext.tsx` — a corrupt
  `localStorage` value falling back to empty is the deliberate, documented
  behavior, not an oversight).
- **Validate at the boundary, trust internal code past it.** A Lambda handler
  validates `event.arguments`; a function called only by other code in the same
  module trusts its caller's types instead of re-checking them.

## 8. Security

- **Never introduce `dangerouslySetInnerHTML`** for any user-supplied or
  AI-generated content. Every tool in this repo renders AI output as plain text
  through ordinary JSX — the `FORMAT_GUARD_INSTRUCTION` in `ai-assist/handler.ts`
  exists specifically so a model reply never needs to be parsed as markdown/HTML in
  the first place. If a future tool seems to need raw HTML rendering, that's a
  signal to reconsider the tool's design, not to add `dangerouslySetInnerHTML`.
- **No secret, token, or credential ever appears in frontend code, a committed file,
  or a build-time env var.** See Section 5 — Amplify secrets are the only sanctioned
  path for anything like this.
- **Treat every external input (AI output, `localStorage` contents, a URL param) as
  untrusted** — parse it defensively (`try { JSON.parse(...) } catch { fall back }`,
  as every context's `readStored`/`fromBackendItem` already does) rather than
  assuming it matches the expected shape.

## Keeping this useful

Like `designs/design-principles.md`, this is a living document. When a new pattern
gets established, a principle above turns out to be wrong, or a real bug reveals a
rule that should have been here, update this file in the same change rather than
letting the lesson live only in `CHANGELOG.md` or a conversation.
