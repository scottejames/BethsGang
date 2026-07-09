# Usage Logging — Design Document

**Status:** Shipped on `main`, 2026-07-08.

## Motivation

"I would like to know what people are doing with the tool." Before this, the app had no
visibility into its own usage at all — no way to answer even "which tools get opened,"
let alone "do AI-backed tools actually succeed when people try them."

## Decision: reuse the AppSync+Lambda pattern, in a dedicated Lambda

Discussed as an open question first (see the "logging" conversation preceding this
build): the realistic options were AWS CloudWatch RUM (a drop-in browser snippet, fully
managed, no backend code) or extending this app's own existing `runAiTool`-style
mutation+Lambda pattern. Chosen: the latter, specifically **a new dedicated Lambda**
(`amplify/functions/log-event/`) rather than folding logging into the existing
`ai-assist` Lambda the way the internal `screenshot-to-text` toolId reuses it.

**Why a separate Lambda, not a shoehorned toolId:** no Anthropic SDK dependency (nothing
to do with Claude), and — the deciding factor — its own CloudWatch log group, so usage
tracking never gets mixed into the same log stream as actual Claude request/response
traffic. Confirmed directly with the user before building (see the "Lambda choice"
decision in that conversation) rather than assumed.

## What gets logged, and the privacy trade-off

Two event types, both centralized so no tool needs its own logging code:

1. **`opened`** — logged in `App.tsx`'s tool-selection handler. Covers every tool,
   present and future, the moment `Home`'s tile is clicked.
2. **`ai_call`** — logged in `useAiTool.ts`'s `run()`, after every AI-backed call
   resolves or rejects. Covers Task Breakdown, Tone Checker, Reply Starter, Call Script,
   Is This Mad?, and the internal `screenshot-to-text` call, automatically.

Non-AI tools (Distract Me, Pomodoro Timer, Remind Me) only get the `opened` event —
their actions aren't centralized through `useAiTool`, so action-level events for those
would need per-tool instrumentation, deliberately not built yet (see `TODO.md`'s
"Action-level usage events for non-AI tools").

**The privacy decision, and how "some content" got interpreted:** asked directly whether
log entries should carry metadata only or include some actual content for deeper
insight; the answer was to include content — but several tools handle real personal
material (reminders, messages someone sent you, tone-check drafts), so shipping that
verbatim to CloudWatch wasn't treated as the default even after that answer.
`src/lib/usageLog.ts`'s `summarizeInputForLogging()` is the compromise: for each field in
a tool's structured input, a **short string value (≤24 chars) is kept as-is** — this
covers the app's actual fixed vocabulary (tone/verbosity/repeat-kind choices like
"friendly," "medium," "weekdays") — while a **longer string value is reduced to just its
length** (`{ length: N }`). This surfaces real behavioral insight (which options people
pick, how long their inputs tend to be, which features get used) without logging the
substance of what anyone typed. The 24-character threshold is a heuristic, not a
guarantee — worth revisiting if it turns out too short/long once real data exists.

## The synchronous-throw bug

Found in testing, not in production: `sendUsageEvent()` originally only wrapped its
GraphQL call in `.catch(() => {})`. When the local `amplify_outputs.json` pointed at a
backend that hadn't yet deployed the `logEvent` mutation (a real, likely-to-recur
situation — the deployed schema is briefly a step behind this code's TypeScript types
right after a schema change lands but before that specific deploy finishes), calling
`client.mutations.logEvent(...)` threw **synchronously** — a `.catch` on the returned
promise doesn't catch a synchronous throw when the method doesn't exist to be called.
This broke tool navigation outright (clicking a tile did nothing) since the throw
happened inside `App.tsx`'s `selectTool` before `setActiveToolId` ever ran.

**Fix:** the entire call is wrapped in try/catch, not just the promise. General
principle worth keeping for any future fire-and-forget telemetry in this codebase:
telemetry must never be able to break the feature it's attached to, and "the promise
rejected" and "the function didn't exist to call" are different failure modes that need
different handling.

## Viewing the data

See `OPERATE.md`'s "Viewing usage logs" section for the live commands (finding the
deployed function name, tailing it, a CloudWatch Logs Insights starting query). Worth
noting operationally: Lambda only creates a function's CloudWatch log group on its
*first invocation* — right after a fresh deploy, there's nothing to find until something
actually triggers an event.

## Testing approach

`amplify/functions/log-event/handler.test.ts` — the Lambda's structured logging and its
malformed-input fallback (never throws, always logs *something* and returns `'ok'`).
`src/lib/usageLog.test.ts` — the `summarizeInputForLogging` heuristic's short/long/
non-string/non-JSON cases, since that's the one piece of real logic in the client-side
path. The wiring itself (does `App.tsx`/`useAiTool.ts` actually call `sendUsageEvent` at
the right moments) was verified end-to-end against the live deployed site: triggering a
real tool-open via Playwright, then confirming the exact log line landed in CloudWatch —
proving the whole path (frontend → AppSync → Lambda → CloudWatch) works, not just each
piece in isolation.
