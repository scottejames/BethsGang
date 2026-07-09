# Design Principles

A living list of the standing principles behind how this project is built — not rules
imposed up front, but ones that emerged from real decisions and were confirmed enough
times to be worth writing down. When a new decision reinforces, refines, or overturns one
of these, update this document rather than letting the principle only live in a
CHANGELOG entry or a memory of the conversation where it came up. Add new principles at
the bottom of their section as they're established — this file is expected to grow.

## Product philosophy

- **The app must be fully functional without a login.** Auth (`designs/
  user-personalization.md`) exists to let signed-in state *sync* things across devices —
  it is not, and must never become, a gate on using any tool. Every tool works exactly
  as well for someone who has never created an account as for someone who has. If a
  future feature seems to require an account to function at all, that's a signal to
  reconsider the feature, not to relax this principle.
- **This is a set of interconnected tools, not one monolithic tool.** Each tool in
  `src/tools/` is self-contained and independently addable/removable (`designs/
  architecture-overview.md`'s plugin framework) — but "interconnected" matters as much
  as "a set of": tools deliberately share global signals (the energy/spoons level, the
  reminders banner firing regardless of which tool is open) rather than being sealed
  silos that happen to sit in the same app. The test for a new tool: does it stand alone
  if removed, *and* does it benefit from the signals the rest of the app already
  provides, without requiring bespoke wiring to get them.
- **Small tools solving one named friction point, not generic AI capability.** Every
  tool exists because a specific, describable moment of difficulty was identified first
  (see each tool's "Problem" in `designs/ai-assist-tools.md`) — never "add an AI feature
  here" as the starting point. A proposed tool without a specific problem it solves is a
  sign to sharpen the idea before building it.
- **Ship simple, add flexibility from real feedback — not speculative upfront design.**
  Remind Me's natural-language grammar, its auto-warning default, and its flexible
  duration phrasing were all added in response to specific reported friction, not
  designed in from the start (`designs/remind-me.md`). Conversely, the plain form
  shipped alongside Remind Me's text input was removed the same day once it turned out
  to add friction without adding capability. Prefer the smallest thing that solves the
  named problem, and let real use tell you what to add next.

## Architecture

- **No relational store.** Amplify Data's `a.model()` (DynamoDB) is the standard for any
  future persisted data, not RDS/Aurora Postgres. This app's data shape is small
  per-user records fetched by owner, with no cross-user joins and no reporting queries
  beyond what CloudWatch already gives via usage logging — a relational database would
  be real operational overhead (a running instance vs. serverless, pay-per-request) for
  a need that doesn't exist. See `designs/user-personalization.md` for the full
  reasoning and the schema-evolution approach this implies.
- **Solve cross-cutting concerns once, at the shared layer — never per-tool.** The
  energy envelope, the format-guard instruction, and usage logging are each one small
  piece of shared plumbing that every current *and future* tool gets automatically,
  specifically so no tool ever needs its own bespoke version. When a bug or need turns
  out to be systemic (the markdown-formatting incident in `designs/ai-assist-tools.md`
  affected every structured-output tool, not just the one that surfaced it), fix it at
  the shared layer even if only one call site has complained yet.
- **Prefer deterministic, local logic over the AI Lambda when correctness matters more
  than flexible generation.** Reminders' natural-language parsing runs entirely
  client-side (`chrono-node`), not through `runAiTool`, because a reminder firing at the
  wrong time is a worse failure than a tool's text looking odd, and because this project
  has already hit a real bug from an LLM not reliably following an exact format
  (`designs/ai-assist-tools.md`'s format-guard incident). Reach for the shared AI Lambda
  pattern when a task genuinely needs generation or judgment — not by default just
  because it's the app's usual convention.
- **Push evolving structure into a flexible field, not a changing schema.** AI tool
  inputs, Reminders' `repeat` rule, and the DynamoDB schema-evolution strategy all use
  the same idea: a single JSON-serializable field that can grow new shapes over time,
  rather than a fixed set of columns/arguments that has to change every time a new case
  shows up. Keeps the outer contract (a GraphQL argument, a database field) stable even
  as what's inside it evolves.

## Data & privacy

- **Log and store the least necessary — never personal content by default.** Usage
  logging (`designs/usage-logging.md`) keeps short, enum-like field values (a chosen
  tone, a repeat kind) but reduces any longer string field to just its length, precisely
  because several tools handle real personal content (reminders, messages someone sent
  you, tone-check drafts). When a future feature needs to log or store something, default
  to the minimum that answers the actual question being asked, and treat storing more
  than that as a decision to justify, not a default.

## Engineering discipline

- **A side feature must never be able to break the feature it's attached to.** Usage
  logging's `sendUsageEvent` wraps its entire call in try/catch, not just a `.catch` on
  the resulting promise, after a real bug where a missing backend mutation threw
  synchronously and broke tool navigation outright (`designs/usage-logging.md`). The
  same instinct applies to browser notifications in Remind Me (best-effort, the in-app
  banner is the guaranteed fallback) — anything that isn't the core purpose of a feature
  should degrade silently, never take the core feature down with it.
- **Verify against real infrastructure for anything user-facing or backend-dependent —
  unit tests alone aren't enough.** Auth flows, live Lambda behavior, and actual
  rendered UI have all had bugs that only real verification caught: querying the
  deployed Lambda directly to diagnose the format-guard incident, screenshotting both
  themes to catch the Authenticator's dark-mode gap, driving real Cognito sign-up/
  sign-in through a personal sandbox. Where a real end-to-end check is possible, treat it
  as required, not optional polish on top of unit tests.
- **Keep the project's documentation current as part of finishing the work, not as a
  follow-up.** `CHANGELOG.md`, `TODO.md`, `README.md`, `OPERATE.md`, and this `designs/`
  folder are expected to reflect the real, current state of the app — a stale doc that
  contradicts the code is worse than no doc, since it actively misleads instead of just
  being silent.
