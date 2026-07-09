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

Currently deployed function (`main` branch, app `dk3ifbty6lizq`) — confirmed working by
triggering a real tool-open on the live site and watching the line land:

```bash
aws logs tail "/aws/lambda/amplify-dk3ifbty6lizq-main--logeventlambda715157D2-HN3FkfHI0kR1" --follow --format short
```

If that log group is ever gone (a fresh deploy replaces the hash suffix, or a new
environment/branch), re-derive it:

```bash
# Note: the deployed name is lowercased ("logeventlambda"), not "logEvent" — a
# case-sensitive `contains` filter on the literal defineFunction name won't match.
aws lambda list-functions --query "Functions[?contains(FunctionName, 'logeventlambda')].FunctionName" --output text
```

**Lazy log group creation**: Lambda only creates a function's CloudWatch log group on
its *first invocation* — right after a fresh deploy (or in a brand new environment),
`describe-log-groups`/`aws logs tail` will find nothing until something actually opens a
tool or makes an AI call. Trigger one yourself (open the app, click a tool) if you need
the log group to exist before you can tail it.

For anything beyond a live tail — e.g. "how many times was Tone Checker used this
week" — reach for CloudWatch Logs Insights in the console instead of eyeballing a
stream; the structured JSON shape means a simple `fields toolId, event | stats count()
by toolId` query works directly.

## Testing auth locally (`feature/user-accounts` branch)

Auth (`amplify/auth/resource.ts`) needs a real Cognito user pool to test against — there's
no local emulator for it. Use your one personal sandbox (`npx ampx sandbox` with no
`--identifier`, same as `runLocal.sh` runs — that flag defaults to your OS username):

```bash
npx ampx sandbox
npm run dev
```

**Don't pass a different `--identifier`** to spin up a second sandbox for auth
testing specifically — that seemed like a reasonable way to isolate auth testing from
"your main sandbox" when this was first written, but in practice it just creates a
second, independent Cognito pool + DynamoDB tables + AppSync API + Lambda functions
sitting alongside your real one. This actually happened during this feature's own
development: an `authtest`-identified sandbox and the default `<username>`-identified
one both existed and both had the current schema, and testing against the wrong one
looked exactly like a sync bug (a reminder created in one didn't "follow" to a browser
pointed at the other) until the two separate CloudFormation stacks were found via
`aws cloudformation list-stacks`. If you ever do end up with more than one, `npx ampx
sandbox delete --identifier <name>` tears one down cleanly (Cognito pool, tables,
functions, all of it) — safe for whichever one *isn't* the one you actually use.

Sign-up and password-reset both email a real confirmation code, so completing those two
flows end-to-end needs a real inbox. Without one, you can still verify almost everything
that matters:

- **Sign-up and forgot-password reach Cognito correctly**: fill and submit each form: a
  successful sign-up lands on a "We Emailed You" screen, a successful reset request lands
  on a "Reset Password" (enter code) screen. Getting there proves the request succeeded;
  only entering the code itself needs the real email.
- **Sign-in, session persistence, and sign-out**, fully end-to-end, using an
  admin-created confirmed user (bypasses email verification entirely):
  ```bash
  aws cognito-idp admin-create-user --user-pool-id <pool-id> \
    --username someone@example.com \
    --user-attributes Name=email,Value=someone@example.com Name=email_verified,Value=true \
    --message-action SUPPRESS --temporary-password 'TempPass123!'
  aws cognito-idp admin-set-user-password --user-pool-id <pool-id> \
    --username someone@example.com --password 'RealPass123!' --permanent
  ```
  (find `<pool-id>` in the sandbox's `amplify_outputs.json` under `auth.user_pool_id`.)
  Sign in through the real UI with that user, reload the page to confirm the session
  survives (Amplify persists the tokens itself), then sign out.
- Clean up afterwards: `aws cognito-idp admin-delete-user --user-pool-id <pool-id>
  --username someone@example.com`.

One gotcha worth knowing if you're scripting against the Authenticator's form fields: the
email input's `name` attribute is `"username"` on the Sign In tab but `"email"` on the
Create Account tab — inconsistent between the two, easy to lose time to.

## Testing per-user Reminder/Spoons persistence (same branch)

`Reminder` and `UserPreferences` are owner-scoped `a.model()`s — same sandbox setup as
above, plus this specific check every time: **verify against the actual DynamoDB
table, not just the UI.** A real bug here (a missing `authMode: 'userPool'` on the Data
client) made every write fail server-side while the app looked completely normal —
optimistic local state and the always-on `localStorage` mirror both make broken backend
writes invisible from the UI alone. To actually confirm persistence:

```bash
# Table names include a hash that changes if the API gets recreated — look them up
# fresh each time rather than assuming a name from a previous session:
aws dynamodb list-tables --query "TableNames[?contains(@, 'Reminder') || contains(@, 'UserPreferences')]"

aws dynamodb scan --table-name <Reminder-table-name>
aws dynamodb scan --table-name <UserPreferences-table-name>
```

A meaningful end-to-end check: sign in as an admin-created test user (see above), add a
reminder and move the Spoons slider, confirm both appear in the DynamoDB scan above
(not just in the browser), then **reload the page** and confirm they're still there —
proves the data came from `observeQuery()`, not just React state that happened to
survive. Then sign out and confirm the reminder/Spoons value is *not* visible anymore
("No reminders set yet.", Spoons back to this device's own local value) — account data
must not linger in the signed-out view. Sign back in and confirm it reappears (proving
it's still there server-side, just correctly hidden while signed out), which a
DynamoDB scan can confirm directly.

If `admin-create-user`/`admin-set-user-password` or a DynamoDB scan starts failing
against IDs that worked earlier in the same session, first check whether you're
actually pointed at your one sandbox — re-check `amplify_outputs.json`'s current
`auth.user_pool_id` against `aws cloudformation list-stacks` before assuming AWS state
drifted; it's more likely a second sandbox got created by accident (see above) than the
same one changing IDs on its own.

## Managing signed-up users (`utils/user-admin/`)

A small standalone CLI for the four things you'd actually need to do to a real user
account: list users, see what data a user has, reset a password, and delete a user
(Cognito account + all their `Reminder`/`UserPreferences` rows — deletion asks for
typed confirmation of the user's email first, since it's irreversible).

```bash
npm run users -- discover        # first time only — finds region/pool ID/table names
                                  # for you to put in utils/user-admin/config.json
npm run users -- list-users
npm run users -- list-data <email-or-username>
npm run users -- reset-password <email-or-username>
npm run users -- delete-user <email-or-username>
```

The script itself (`index.mjs`) is committed — it has no pool IDs, table names, or
credentials in it. Those live in `utils/user-admin/config.json`, which is gitignored
and created automatically (with blank fields) the first time you run any command if
it's missing. AWS credentials themselves are never read from that file — the tool uses
your normal AWS CLI credential chain (`~/.aws/credentials`, `AWS_PROFILE`, SSO, etc.),
same as running `aws` commands directly.

Points at whichever sandbox `config.json` names — for the sandbox/pool-consolidation
reason above, that should be your one default sandbox, not a separately-identified one.

## Keeping the project's artifacts current

After shipping anything significant (a new tool, an architecture change, a real bug fix),
there's a project skill for this: `.claude/skills/update-project-artifacts/SKILL.md`. It
walks through updating `CHANGELOG.md`, `TODO.md`, `README.md`, and this file, running
`npm run verify`, and confirming new files are actually tracked by git — read it directly
for the full checklist. It's written to self-trigger for Claude Code sessions working in
this repo; invoke it by hand with `/update-project-artifacts` if it doesn't.
