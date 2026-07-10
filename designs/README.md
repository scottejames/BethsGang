# Design Documents

Retrospective design docs for this project's key features and services — the *why*
behind decisions, not just the *what* (which the code and `CHANGELOG.md` already show).
Written to be the fast way back into the reasoning behind a piece of the app: what
problem it solves, what alternatives were considered and rejected, what bugs shaped the
final design, and how it was verified. Read `architecture-overview.md` first — every
other document assumes its patterns.

| Document | Covers |
|---|---|
| [`design-principles.md`](./design-principles.md) | The standing principles behind how this project gets built — no login wall, no relational store, a set of interconnected tools rather than one monolith, and more. A living list, meant to be added to. Worth reading alongside `architecture-overview.md`. |
| [`architecture-overview.md`](./architecture-overview.md) | The foundational patterns everything else builds on: the tool-plugin framework, the shared AI Lambda + prompt map, the energy envelope, and the persistent-provider pattern (Distract Me → Energy → Reminders → Auth, each extending the last). Start here. |
| [`ai-assist-tools.md`](./ai-assist-tools.md) | The five AI-backed tools (Task Breakdown, Tone Checker + screenshot upload, Reply Starter, Call Script, Is This Mad?) — what problem each one solves, the Is This Mad?/Just The Facts merge, and the format-guard bug that shaped how every tool's prompt is built. |
| [`distract-me-and-pomodoro.md`](./distract-me-and-pomodoro.md) | The two client-side, no-AI tools — where the persistent-provider pattern originated, and the pop-sound-plays-twice bug whose fix (side effects out of `setState` updaters) got reapplied twice more later in the project. |
| [`remind-me.md`](./remind-me.md) | Natural-language reminders — the most-iterated feature in the project. The deterministic-parsing-over-AI decision, four rounds of direct-feedback corrections (grammar, auto-warnings, past-time validation, flexible phrasing), and the real chrono-node bugs found and fixed along the way. |
| [`usage-logging.md`](./usage-logging.md) | Knowing what people actually do with the app — the dedicated-Lambda decision, the privacy trade-off behind what gets logged, and a synchronous-throw bug worth remembering for any future fire-and-forget telemetry. |
| [`branding-and-theme.md`](./branding-and-theme.md) | The hand-drawn logo and the rainbow theme sampled from it — image processing (transparency, favicon), the decorative-only rule for rainbow colors vs. the one grounding accent, and why layout went through two feedback rounds. |
| [`user-personalization.md`](./user-personalization.md) | User accounts, all shipped on `main`: Phase 1 (Cognito auth), Phase 2 (per-user Reminders + Spoons), and Phase 3 (the Shared Task Store) — including the storage decision (DynamoDB via `a.model()`) and the schema-evolution strategy for changes after this point. |

## Keeping this useful

These are living documents, not a one-time snapshot — when a feature covered here changes
in a way that invalidates what's written (a new architectural decision, a reversed
trade-off, a bug fix that changes the design), update the relevant document rather than
letting it drift out of sync with the code. A design doc that's known to be stale is
worse than no design doc, since it actively misleads instead of just being silent.
