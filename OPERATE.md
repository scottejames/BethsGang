# Operating Beth's Gang

Day-to-day commands for building, testing, and running this app locally. For
architecture, dependencies, and deployment to AWS Amplify Hosting, see `README.md`.

## Quick reference

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `./runLocal.sh` | One command: checks + starts sandbox + dev server, prints the local URL |
| `npm run dev` | Frontend dev server only (no AI tool calls without a sandbox running) |
| `npm run build` | Typechecks the frontend (`tsc -b`) and produces `dist/` (`vite build`) |
| `npm run typecheck:amplify` | Typechecks the Amplify backend/Lambda code |
| `npm run lint` | oxlint |
| `npm test` | Runs the test suite (Vitest) |
| `npm run verify` | Lint + backend typecheck + build + test, in one command |

## Prerequisites

- Node 20+ (matches current Amplify Gen2 Lambda runtimes)
- AWS CLI configured with credentials for the target account, if you'll run
  `npx ampx sandbox` or deploy
- An Anthropic API key, if you want the AI-backed tools (Task Breakdown, Tone Checker,
  Reply Starter) to actually respond rather than just render

```bash
npm install
```

## Running it locally

**Fastest path:**

```bash
./runLocal.sh
```

This does four things, in order, and stops early with a clear message if something's
wrong rather than leaving you guessing:

1. Installs dependencies if `node_modules` is missing.
2. Checks `ANTHROPIC_API_KEY` is set for your sandbox (`npx ampx sandbox secret list`) —
   exits with the exact command to run if it isn't (`npx ampx sandbox secret set
   ANTHROPIC_API_KEY`).
3. Typechecks (`tsc -b`) so an obvious error surfaces in seconds, not after waiting on a
   full sandbox deploy.
4. Starts the Amplify sandbox (backend) in the background and the Vite dev server
   (frontend) in the foreground together, printing the local URL. `Ctrl+C` stops both —
   it traps the exit and kills the backgrounded sandbox process for you.

**Manual path** (two terminals), if you want the sandbox's own logs visible on their own,
or need flags `runLocal.sh` doesn't expose:

```bash
# Terminal 1 — backend, watches amplify/ and hot-deploys
npx ampx sandbox

# Terminal 2 — frontend
npm run dev
```

Either way, the sandbox writes a fresh `amplify_outputs.json` pointing at your personal
sandbox backend — separate from whatever's deployed to Amplify Hosting. Running a sandbox
never risks the deployed app: it's a fully separate CloudFormation stack, with its own
API, Lambda, and secrets (`ANTHROPIC_API_KEY` must be set separately for the sandbox via
`npx ampx sandbox secret set` — it's not shared with the deployed branch's secret in the
Amplify console). The only local side effect is that `npm run dev` will talk to whichever
backend your `amplify_outputs.json` currently points at.

## Build

```bash
npm run build
```

Runs `tsc -b` (typechecks the frontend against `tsconfig.app.json` / `tsconfig.node.json`)
then `vite build` (bundles to `dist/`). This is what Amplify Hosting's CI runs too (see
`amplify.yml`) — if it fails locally, it'll fail there.

The Amplify backend (`amplify/`) isn't part of this build — it has its own typecheck (see
below) and is deployed separately via `ampx sandbox` (dev) or `ampx pipeline-deploy`
(Amplify Hosting CI).

## Typecheck the backend

```bash
npm run typecheck:amplify
```

Runs `tsc -p amplify/tsconfig.json` — a standalone TypeScript config scoped to
`amplify/**/*.ts`, separate from the frontend's project references since the Lambda code
runs in Node, not the browser. This doesn't run as part of `npm run build`; it's its own
step, chained into `npm run verify`.

## Lint

```bash
npm run lint
```

oxlint, configured in `.oxlintrc.json`. A handful of `react(only-export-components)`
warnings are expected and intentional (tool files export both a component and its
metadata from one file, by design) — those are warnings, not errors, and don't fail the
command. If lint output looks longer than that, something's actually wrong.

## Test

```bash
npm test
```

Runs [Vitest](https://vitest.dev/) (config lives in `vite.config.ts`'s `test` block).
Test files sit next to the code they test — `*.test.ts` / `*.test.tsx`, not a separate
`tests/` folder:

- `amplify/functions/ai-assist/handler.test.ts` — pure-function unit tests for the Lambda
  (envelope parsing, energy-level bucketing, per-tool message builders).
- `src/tools/pomodoroTimer/index.test.tsx` — a component test using fake timers and a
  mocked `HTMLMediaElement.play` to verify the pop sound fires exactly once on completion.
- `src/context/RemindersContext.test.tsx` — tests a context provider (not a component)
  directly via `renderHook(() => useReminders(), { wrapper: RemindersProvider })` from
  `@testing-library/react`, combined with fake timers to exercise the warning/due/repeat
  scheduling and the catch-up-on-mount path without waiting on real wall-clock time.

**When adding a backend/Lambda test:** the project's default test environment is `jsdom`
(needed for component tests). The Anthropic SDK refuses to construct under a browser-like
global scope, so any test file that imports `amplify/functions/ai-assist/handler.ts`
needs `// @vitest-environment node` as its first line to opt back into a plain Node
environment for that file only. `handler.test.ts` also sets a dummy
`process.env.ANTHROPIC_API_KEY` before importing the handler, since the client is
constructed at module load time and needs *a* key present (no real API call is made by
these tests — only the exported pure helper functions are exercised).

**When adding a component test:** render via `@testing-library/react`, and if it touches
timers or audio, check `index.test.tsx` for the pattern (`vi.useFakeTimers()` +
`vi.advanceTimersByTimeAsync()`, spying on `HTMLMediaElement.prototype.play` rather than
letting jsdom attempt real playback).

## Verify — run this before pushing

```bash
npm run verify
```

Chains `lint` → `typecheck:amplify` → `build` → `test`. One command instead of running
each check separately (which is what this document replaces — see CHANGELOG.md's
2026-07-07 entry for why it was worth formalizing). Green locally means the same checks
Amplify Hosting's own build would hit are already covered — it won't catch Amplify-side
issues like a stale secret or IAM permissions, but it catches everything that's actually
about the code.

## Viewing usage logs

Every tool-open and every AI-backed tool call is logged to CloudWatch via a dedicated
`log-event` Lambda (see `amplify/functions/log-event/`) — kept separate from the
`ai-assist` Lambda's own logs so usage tracking never gets mixed in with Claude API
request/response logging. Each log line is a single JSON object (`{"type":"usage",
"toolId":...,"event":"opened"|"ai_call",...}`), so it's easy to filter/query.

Find the function's log group once, then tail it live:

```bash
# One-time: find the exact deployed function name (the suffix hash varies per deploy).
aws lambda list-functions --query "Functions[?contains(FunctionName, 'logEvent')].FunctionName" --output text

# Then tail it live while using the app:
aws logs tail /aws/lambda/<the-name-from-above> --follow --format short
```

For anything beyond a live tail — e.g. "how many times was Tone Checker used this
week" — reach for CloudWatch Logs Insights in the console instead of eyeballing a
stream; the structured JSON shape means a simple `fields toolId, event | stats count()
by toolId` query works directly.

## Keeping the project's artifacts current

After shipping anything significant (a new tool, an architecture change, a real bug fix),
there's a project skill for this: `.claude/skills/update-project-artifacts/SKILL.md`. It
walks through updating `CHANGELOG.md`, `TODO.md`, `README.md`, and this file, running
`npm run verify`, and confirming new files are actually tracked by git — read it directly
for the full checklist. It's written to self-trigger for Claude Code sessions working in
this repo; invoke it by hand with `/update-project-artifacts` if it doesn't.
