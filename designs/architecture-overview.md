# Architecture Overview — Beth's Gang

**Status:** Foundational, in place since the project's start (2026-07-06), extended
incrementally as each feature below needed something new from it.

This is the "read first" document — the patterns here are what every other design doc in
this folder builds on top of. It exists because this app is deliberately built as a
**plugin framework**, not a monolith with features bolted on: the whole point is that
adding the *next* tool should be cheap and mechanical, not require touching the app
shell. Every later design decision (Remind Me, usage logging, auth) either follows these
patterns or explicitly explains why it needed to deviate.

## The core idea: tools are plugins

`src/tools/<tool-id>/` is the entire unit. Each folder exports a `ToolDefinition`
(`meta` + `Component`) from `index.tsx`, with metadata (id, name, tagline, icon) in
`meta.ts`. `src/tools/registry.ts` is the single list the UI reads from — `Home.tsx`
renders tiles from it, `App.tsx` looks up the active tool by id from it. **Adding a tool
never requires touching `App.tsx`, `Home.tsx`, or any routing** — there is no router;
`App.tsx` just swaps between the tile grid and the active tool based on local state.

Why this shape: the project's whole premise is "a small toolbox," expected to grow tool
by tool over many sessions. A registry + self-contained folder means each addition is
additive and reviewable in isolation, and nothing about tool #9 can accidentally break
tool #3's wiring.

## The AI backend: one Lambda, one map

Tools that need Claude call a single GraphQL query, `runAiTool(toolId, input)`, defined
in `amplify/data/resource.ts` with `allow.publicApiKey()` authorization (no login
required — see `designs/user-personalization.md` for why auth, when it arrived, stayed
separate from this). One Lambda (`amplify/functions/ai-assist/handler.ts`) resolves it by
looking up `toolId` in a `SYSTEM_PROMPTS` record and calling `@anthropic-ai/sdk` with
`claude-haiku-4-5` (the cheapest current model — these tools don't need frontier
reasoning). **Adding a new AI-backed tool is a new map entry, nothing else** — no new
Lambda, no new API route, no new deploy target.

Tools needing more than one input field (e.g. Reply Starter's message + tone + length +
intent) `JSON.stringify` a small payload into the single `input` string rather than
changing the shared schema, with a per-tool parser registered in
`USER_MESSAGE_BUILDERS`. Tools that don't register one just get `input` passed straight
through (Task Breakdown, Pomodoro's non-AI path). This is the same "structured payload in
a flexible string field" idea that later informed the DynamoDB schema-evolution strategy
in `designs/user-personalization.md` — same tension (a fixed API surface vs. tools that
need different shapes), same answer (push the structure into the payload, not the
schema).

A tool can also send an image instead of text (Tone Checker's screenshot feature — see
`designs/ai-assist-tools.md`): the frontend resizes/compresses it client-side and sends
`{ imageBase64, mediaType }` JSON, same convention as any other structured input. The
Lambda has one internal-only `toolId`, `screenshot-to-text`, never in `registry.ts` —
called directly by Tone Checker via a second `useAiTool` instance.

### The format-guard bug (why every tool's prompt gets a shared prefix)

A real production bug, not a hypothetical: the model would occasionally wrap field
labels in markdown (`**Tone:**` instead of `Tone:`) or append an unrequested extra
paragraph. Every tool's frontend parser matches exact label prefixes and renders plain
text, so this silently broke parsing or dumped raw markdown to the screen — which is what
a user experienced as the app "crashing." Traced by querying the deployed Lambda directly
(bypassing the frontend) at varying energy levels, which disproved the first theory
(high-spoons-only) once a spoons=9 report reproduced it too. Fixed at the shared level —
a `FORMAT_GUARD_INSTRUCTION` constant unconditionally prepended to *every* tool's system
prompt — rather than patching the one tool that surfaced it, since the same risk existed
for all of them. See `designs/ai-assist-tools.md` for the full incident.

## The energy envelope: one wrapper, zero per-tool code

Every AI tool's request is wrapped as `{ spoons, input }` by `useAiTool.ts`
(`src/hooks/useAiTool.ts`), where `spoons` is the user's self-reported 0–100 energy level
("Spoon Theory" — a global picker, `EnergyContext` + `EnergyButton`, not a tool of its
own). The Lambda's `parseEnvelope()` + `buildEnergyInstruction()` unwrap it once and
prepend a shared low/medium/high instruction before the tool-specific prompt. Every
current and future AI tool gets response complexity that scales with energy, with zero
tool-specific code — the same "solve it once, centrally" instinct as the format guard.

## The persistent-provider pattern

Tools are normally mounted/unmounted as the user navigates — fine for stateless tools,
wrong for anything that must keep running in the background (Distract Me's audio
shouldn't stop because you switched tools; a Reminder must still fire). The pattern:
put the actual state in a React Context provider mounted once at the app root
(`main.tsx`), not inside the tool component. The tool's own page becomes one consumer of
that context; a persistent UI element outside the tool tree (rendered unconditionally in
`App.tsx`) can be another.

Five providers now use this shape, each extending it slightly further:

| Provider | Persistent UI | What it added |
|---|---|---|
| `DistractMeContext` | `NowPlayingBar` | The original pattern — see `designs/distract-me-and-pomodoro.md` |
| `EnergyContext` | `EnergyButton` | A global *setting* every tool reads, not just a stateful widget |
| `RemindersContext` | `AlertBanner` | State that must survive a full page reload, not just tool navigation, and fire on its own timer regardless of what's on screen — see `designs/remind-me.md` |
| `TimetableContext` | `AlertBanner` (shared) | A second "fires independent of what's on screen" source feeding the *same* banner as `RemindersContext` — every screen corner was already claimed, and this was the Rule-of-Three case for merging the display layer rather than adding a competing one. See `designs/timetable.md`. |
| `AuthContext` | `AccountButton` | Reflects state Amplify itself already persists (session tokens) rather than owning storage directly — see `designs/user-personalization.md` |

All five are wired into `main.tsx` in the same nested-provider block, and their
persistent UI components are rendered unconditionally in `App.tsx` alongside each other
(`EnergyButton` top-right, `AccountButton` top-left, `AlertBanner` top-center,
`NowPlayingBar` bottom-center — corners/edges claimed in build order, worth checking
before adding another).

`RemindersContext`, `TimetableContext`, and `EnergyContext` are also, independently, the
only providers whose *storage* is conditional on `AuthContext`: `localStorage` when
signed out (as described above, unchanged), a backend `a.model()` behind
`AuthContext`'s `isSignedIn`
when signed in. That's a second, orthogonal axis from this table — which UI owns which
persistent React state — not a new pattern of its own; see `designs/user-
personalization.md`'s "What Phase 2 built" for how the storage switch itself works.

## Where things live

```
src/
  tools/<tool-id>/       — one folder per tool (meta.ts + index.tsx)
  tools/registry.ts      — the single list the UI reads from
  context/               — persistent-provider pattern (Energy, DistractMe, Reminders,
                            Timetable, Auth)
  components/            — Home, ToolShell, Modal, and the always-mounted UI (EnergyButton,
                            AccountButton, AlertBanner, NowPlayingBar)
  hooks/                 — useAiTool (the energy envelope), useReminders, useAuth, useUsageLog
  lib/                   — pure functions with no React dependency (aiClient, reminderParser,
                            usageLog, imageCapture)
amplify/
  auth/resource.ts        — Cognito (see designs/user-personalization.md)
  data/resource.ts         — the GraphQL schema: runAiTool, logEvent (Phase 2 will add
                            per-user models here — see designs/user-personalization.md)
  functions/ai-assist/     — the one Lambda every AI tool shares
  functions/log-event/     — a deliberately separate Lambda for usage tracking (see
                            designs/usage-logging.md — kept apart so it never shares a
                            log stream or a failure mode with ai-assist)
```

## Testing conventions

Test files sit next to the code they test (`*.test.ts(x)`), not in a separate `tests/`
folder. Backend/Lambda test files need `// @vitest-environment node` (the project
default is `jsdom`, for component tests; the Anthropic SDK refuses to construct under a
browser-like global scope). Client-side timer/async logic (Pomodoro's countdown,
Reminders' warning/due scheduling) is tested with Vitest's fake timers rather than real
waits. Real backend integration (actual Cognito flows, actual deployed Lambda behavior)
is verified against a personal `ampx sandbox` and/or the live site with Playwright, since
neither is meaningfully mockable — see `OPERATE.md` for the exact commands.
