# Changelog

All notable changes to this project are documented here.

## 2026-07-06

### Added

- Initial project scaffold: Vite + React + TypeScript single-page app, deployable to
  AWS Amplify Hosting (Amplify Gen2 backend).
- Tool plugin framework (`src/tools/`): each tool is a self-contained module (`meta.ts` +
  `index.tsx`) registered in `src/tools/registry.ts`. Adding a tool requires no changes
  to routing or the app shell.
- AI backend: a single Amplify Data query, `runAiTool(toolId, input)`, resolved by one
  Lambda (`amplify/functions/ai-assist/handler.ts`) that maps `toolId` to a system prompt
  and calls the Claude API via `@anthropic-ai/sdk`. New AI-backed tools only need a new
  system-prompt entry, not new infrastructure.
- Anthropic API key stored as an Amplify secret, injected into the Lambda environment —
  never exposed to the frontend.
- **Task Breakdown** tool — turns an overwhelming task into a short list of small,
  concrete, startable steps.
- **Tone Checker** tool — checks how a drafted message (email/text/Slack) is likely to
  land before sending, with a tone label and one rewrite suggestion.
- Home screen with a card grid of available tools; simple back-navigation shell for the
  active tool (no router).
- Calm, low-clutter light/dark UI styling geared towards reducing visual noise.
- `amplify.yml` build spec for Amplify Hosting CI/CD (backend + frontend phases).
- `README.md` describing dependencies, local dev, deployment, and architecture.
- `CHANGELOG.md` (this file).
- `TODO.md` — backlog of future tool ideas (Side Quest Log, Is This Mad?, Just The Facts,
  Reply Starter, How Long Will This Actually Take, Brain Dump Sorter), linked from
  README.md under a new "Roadmap" section.
- **Reply Starter** tool — paste a message you owe a reply to and get 3 short, low-effort
  draft replies (each with a one-click copy button) to break initiation paralysis.
- `runLocal.sh` — one-command local dev bootstrapper: checks `node_modules` is installed,
  checks the `ANTHROPIC_API_KEY` sandbox secret is set, typechecks, then starts the
  Amplify sandbox and the Vite dev server together and prints the local app URL.
- **Pomodoro Timer** tool — 5/10/15 minute focus timer with stop/resume and reset, and a
  gently pulsing tomato graphic (Twemoji, CC-BY 4.0 — see README "Assets") while running.

### Changed

- `ai-assist` Lambda now calls `claude-haiku-4-5` instead of `claude-opus-4-8` — the
  cheapest current Claude model, since Task Breakdown and Tone Checker don't need
  frontier-level reasoning.
- Reply Starter now has Tone (Formal/Neutral/Friendly), Length (Short/Medium/Long), and an
  optional free-text "intent" field. The frontend sends these as structured JSON inside the
  existing `runAiTool(toolId, input)` string argument; a small per-tool builder in
  `ai-assist/handler.ts` (`USER_MESSAGE_BUILDERS`) turns that JSON into the actual prompt.
  The shared query/schema didn't need to change, and every other tool is unaffected.
- Tone Checker now has an optional "Context" field (e.g. who the message is going to, or
  something relevant about the situation) using the same structured-JSON pattern as Reply
  Starter. Deliberately phrased low-pressure and factual ("optional — only if it helps",
  example text about the situation rather than feelings) rather than suggesting emotionally
  loaded example phrasing, so the field itself doesn't prime worst-case framing.

### Fixed

- Amplify Hosting build was failing at the `BUILD` step: `npm ci` requires
  `package-lock.json` to exactly match `package.json`, and the committed lockfile had
  drifted out of sync (missing `@opentelemetry/core@2.0.0` / `uuid@9.0.1`, both pulled in
  via `@aws-amplify/graphql-api-construct`'s large `bundledDependencies` tree). Regenerated
  `package-lock.json` from scratch; it still failed `npm ci` even freshly generated (an
  npm/bundled-dependency interaction, not a real drift), so `amplify.yml` now uses
  `npm install` instead of `npm ci` for both the backend and frontend install steps.
- Reply Starter's tool folder (`meta.ts`, `index.tsx`) was left out of the commit that
  introduced it, so the Amplify Hosting build failed with `Cannot find module
  './replyStarter'` (worked locally since the files existed on disk; only broke on a clean
  CI clone). Committed the missing files.
