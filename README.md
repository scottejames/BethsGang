# Beth's Gang

A single-page web app that helps people with ADHD get things done.  It's built as a small **plugin framework**: each tool is a self-contained module, so new ones can be added without touching the rest of
the app.

Day-to-day build/test/run commands are in [`OPERATE.md`](./OPERATE.md). This file covers
architecture, dependencies, and deployment. Coding standards for this stack (React/
TypeScript, Amplify Gen2, testing, security) are in
[`CODING_GUIDELINES.md`](./CODING_GUIDELINES.md).

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Frontend (React + Vite)    │        │  Backend (AWS Amplify Gen2)  │
│                              │        │                              │
│  Home ── tool grid           │        │  Amplify Data (AppSync)      │
│    │                         │  GraphQL │    runAiTool(toolId, input) │
│    ▼                         │ ───────▶ │        │                    │
│  ToolShell ── active tool    │        │        ▼                    │
│    │                         │        │  Lambda: ai-assist           │
│    ▼                         │        │    SYSTEM_PROMPTS[toolId]     │
│  src/tools/<tool>/           │        │        │                    │
│    meta.ts   (id, name...)   │        │        ▼                    │
│    index.tsx (component)     │        │  Anthropic API (Claude)      │
└─────────────────────────────┘        └──────────────────────────────┘
```

- **Frontend** — a Vite + React + TypeScript single-page app. No router: `App.tsx` just
  swaps between the tool grid (`Home`) and the active tool (`ToolShell`) based on local
  state.
- **Tool framework** — every tool lives in `src/tools/<tool-id>/` and exports a
  `ToolDefinition` (`meta` + `Component`). `src/tools/registry.ts` is the single list the
  UI reads from. Adding a tool never requires touching `App.tsx`, `Home.tsx`, or routing.
- **Home screen layout** — `Home.tsx` renders three tabs, currently labeled **Everyday
  Helpers**, **Get Organized**, and **Study Help** (`ToolMeta.category`:
  `'general'`/`'planning'`/`'study'`, see below), each its own `.tool-grid`
  (`grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`) filtered from
  `registry.ts` in registry order — no manual per-tool ordering *within* a tab, just
  the one required category field deciding which tab a tool lands in. The `'planning'`
  category is specifically "wired into the Shared Task Store" (Everything Pile itself,
  Task Breakdown, Side Quest Log, Brain Dump Sorter); `'study'` is for school tools
  (Essay Phrase Bank, Assignment Breakdown, Essay Structure Planner, Timetable);
  everything else is `'general'`,
  including tools that are arguably "about getting things done" (e.g. Remind Me) but
  aren't actually part of the planning pipeline. Reflows from 1 column on mobile up to 4 on
  desktop with no media queries. Tool screens (`ToolShell`) keep a narrower 720px
  reading-width cap for forms/text/AI output; only `.home` gets the wider (1100px)
  cap, since a card grid doesn't have the same long-line-length
  readability concern — see `#root`/`.tool-shell`/`.home` in `src/index.css` for how
  that width constraint is split between the two.
- **AI backend** — tools that need Claude call a single GraphQL query,
  `runAiTool(toolId, input)`, defined in `amplify/data/resource.ts`. It's resolved by one
  Lambda (`amplify/functions/ai-assist/handler.ts`) that looks up a system prompt for the
  given `toolId` in a `SYSTEM_PROMPTS` map and calls the Claude API via the official
  `@anthropic-ai/sdk`. **Adding a new AI-backed tool only requires a new map entry here** —
  no new Lambda, no new API route. The Lambda calls `claude-haiku-4-5` — the cheapest
  current Claude model — since these tools (breakdown, tone check) don't need frontier
  reasoning. Bump to a stronger model in `handler.ts` if a future tool needs more
  capability.
- **Secrets** — the Anthropic API key is stored as an Amplify secret and injected into the
  Lambda's environment at deploy time. It is never present in frontend code or bundled
  output.
- **Usage logging** — a separate `logEvent` mutation and dedicated `log-event` Lambda
  (no Anthropic SDK, its own CloudWatch log group) record which tools get opened and
  whether AI-backed calls succeed, fire-and-forget from `src/lib/usageLog.ts`. It's
  wired in at exactly two centralized points — `App.tsx`'s tool-selection handler and
  `useAiTool.ts`'s `run()` — so every current and future tool is covered automatically,
  no per-tool logging code required. See `OPERATE.md`'s "Viewing usage logs" for how to
  actually read what it collects.
- **Auth** — `amplify/auth/resource.ts`
  defines Cognito email/password auth via `defineAuth`. `src/context/AuthContext.tsx`
  reflects Amplify's own persisted session into React (same Context+Provider+hook shape
  as `EnergyContext`/`RemindersContext`), and `src/components/AccountButton.tsx` is the
  only UI that opens the sign-in flow — a fixed top-left button opening a themed Amplify
  UI `<Authenticator>` in the existing `Modal.tsx`. This is deliberately opt-in, not a
  login gate — `localStorage` remains the full default experience for anyone not signed
  in, and `runAiTool`/`logEvent` stay on the public API key regardless of sign-in state.
  See `src/index.css`'s `.amplify-auth-theme` block for how the Authenticator's
  `--amplify-*` tokens are mapped onto this app's own colors so it doesn't look like a
  bolted-on third-party widget — the card/tabs, field text, and validation-error text
  each needed the more specific `--amplify-components-*` tokens, not the general
  `--amplify-colors-*` ones, to actually follow dark mode (see
  `designs/user-personalization.md` for the full explanation of why).
- **Per-user persistence** — `Reminder`, `UserPreferences`, `Project`,
  and `Task` are owner-scoped `a.model()`s in `amplify/data/resource.ts`
  (`allow.owner()`, distinct from `runAiTool`/`logEvent`'s public API key auth).
  `RemindersContext`/`EnergyContext`/`TaskStoreContext` use them via
  `client.models.*.observeQuery()` (see `src/lib/dataClient.ts`) when signed in, and
  fall back to exactly their prior `localStorage`-only behavior when signed out.
  Reminders and the Task Store both migrate from `localStorage` to the account
  silently on first sign-in per device; see `designs/user-personalization.md`'s "What
  Phase 2 built" for the migration-UX decision and a real bug worth knowing about for
  any future owner-scoped model: the Data client's default authMode follows the
  *schema's* `defaultAuthorizationMode`, not a specific model's own authorization
  rule, so it has to be set explicitly per client (or per call) — the failure
  otherwise is a silent, UI-looks-fine "Not Authorized" on every write.
- **Shared Task Store** (`src/context/TaskStoreContext.tsx`) — `Project`/`Task`, the
  same Context+Provider+hook shape as every other persistent provider, mounted at the
  app root so any tool can read/write it without navigating into whichever tool has it
  open. Follows Reminder's exact signed-in/signed-out shape (see "Per-user
  persistence" above and `designs/user-personalization.md`'s "Phase 3") — `localStorage`
  remains the full default for anyone not signed in. `Task.projectId` is a plain
  optional string, not an Amplify `belongsTo`/`hasMany` relation — deleting a project
  detaches (not cascade-deletes) its tasks, which a real relation would need its own
  policy to express. Consumed by **Everything Pile** and, since it's the first
  tool-to-tool link (see below), **Task Breakdown** and **Side Quest Log** too. See
  `TODO.md`'s "Linking tools together" for what else this unlocks, still unstarted.
- **Tool-to-tool navigation** (`src/context/ToolNavigationContext.tsx`) — owns
  `activeToolId` (previously local state in `App.tsx`) plus `navigateToTool`/`goHome`,
  so any tool can send the user to another tool, not just `Home`. Also where the
  "opened" usage-log event fires now, covering every navigation path uniformly rather
  than only the Home-click one. Everything Pile's 🧩 "Break down" button uses this to
  jump to Task Breakdown, carrying a small typed handoff (`TaskBreakdownRequest`:
  which project, and what to pre-fill the task text with) via
  `pendingBreakdownRequest`/`requestTaskBreakdown`/`clearBreakdownRequest` — a one-shot
  value Task Breakdown reads and clears in a mount-only effect, not a generic
  "any payload" system. Task Breakdown's own "send back" button is the return trip:
  `addProject()`'s return value (the created `Project`, not just `void`) is what lets
  it create-and-immediately-use a new project's id when there's no origin project to
  send steps back into instead.

## Dependencies

| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | Dev server & build |
| `vite-plugin-pwa` | Generates the web app manifest and a Workbox service worker at build time — see "Progressive Web App" below |
| `typescript` | Type checking |
| `aws-amplify` | Frontend client for calling the Amplify Data API |
| `@aws-amplify/ui-react` | The `<Authenticator>` component behind `AccountButton.tsx` |
| `@aws-amplify/backend`, `@aws-amplify/backend-cli` | Amplify Gen2 backend definition (`amplify/`) and the `ampx` CLI |
| `aws-cdk-lib`, `constructs` | Required by `@aws-amplify/backend` under the hood |
| `@anthropic-ai/sdk` | Calls the Claude API from the `ai-assist` Lambda |
| `chrono-node` | Parses natural-language reminder text (Remind Me) into an actual date/time, entirely client-side |
| `oxlint` | Linting |
| `vitest` | Test runner (shares config with Vite via `vite.config.ts`'s `test` block) |
| `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` | Component tests (DOM environment for tests that render React components) |
| `@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` | `utils/user-admin/`'s admin CLI only — not used by the app itself |

Node 20+ is recommended (matches current Amplify Gen2 Lambda runtimes).

## Local development

```bash
npm install

# One-time: deploy a personal backend sandbox to your AWS account.
# This creates real AWS resources (AppSync API, Lambda, etc.) under your account
# and writes a real amplify_outputs.json (a placeholder ships in the repo so the
# frontend builds before you've deployed anything).
npx ampx sandbox

# One-time per sandbox: store your Anthropic API key as a secret.
# The sandbox command above will prompt for this if it's unset.
npx ampx sandbox secret set ANTHROPIC_API_KEY

# In a second terminal: run the frontend dev server
npm run dev
```

Leave `ampx sandbox` running while you develop — it watches `amplify/` and hot-deploys
backend changes, and keeps `amplify_outputs.json` up to date.

Other scripts:

```bash
npm run build              # tsc -b && vite build — production frontend build to dist/
npm run preview            # serve the production build locally
npm run lint                # oxlint
npm test                    # vitest run — unit/component tests (see "Testing" below)
npm run typecheck:amplify   # tsc -p amplify/tsconfig.json — typechecks the backend/Lambda code
npm run verify              # lint + typecheck:amplify + build + test, in one command
```

Run `npm run verify` before pushing — it's the same set of checks worth running as a group
rather than remembering each one separately, and it's what would back a CI workflow if one
gets added later.

## Testing

`npm test` runs [Vitest](https://vitest.dev/). Test files sit next to the code they test
(`*.test.ts` / `*.test.tsx`), not in a separate `tests/` folder. Two examples to follow:

- `amplify/functions/ai-assist/handler.test.ts` — pure-function unit tests (envelope
  parsing, the energy-level bucketing, the per-tool message builders). These need
  `// @vitest-environment node` at the top of the file: the project's default test
  environment is `jsdom` (needed for React component tests elsewhere), but the Anthropic
  SDK refuses to construct in a browser-like global scope, so backend/Lambda test files
  must opt back into a plain Node environment.
- `src/tools/pomodoroTimer/index.test.tsx` — a React component test (Testing Library +
  Vitest's fake timers) that is a regression test for a real bug: the pop-sound-plays-twice
  issue (see CHANGELOG.md) only reproduced under tight/rapid timer ticks, which fake timers
  happen to trigger — a good example of a test earning its keep by finding something real,
  not just exercising the happy path.

## Deploying to AWS Amplify Hosting

1. Push this repo to GitHub/GitLab/CodeCommit/Bitbucket.
2. In the AWS Amplify console, create a new app and connect the repo/branch. Amplify
   detects `amplify.yml` (checked into this repo) and uses it for both the backend
   deploy (`ampx pipeline-deploy`) and the frontend build.
3. Add the `ANTHROPIC_API_KEY` secret for that branch/environment: either via
   `npx ampx pipeline-deploy` secret configuration or in the Amplify console under
   **App settings → Secrets**. The `ai-assist` Lambda reads it from its environment —
   see `amplify/functions/ai-assist/resource.ts`.
4. Push to the connected branch to trigger a build. Amplify builds the backend first,
   then the frontend (which picks up the freshly generated `amplify_outputs.json`).

## Progressive Web App

`vite build` (via `vite-plugin-pwa`, configured in `vite.config.ts`) generates a web app
manifest and a Workbox service worker alongside the usual `dist/` output — no separate
build step. This is what lets a browser (or a user, via the browser's own "Install"
prompt) install the app to a device's home screen/dock/app list and open it in its own
window, without an app-store listing.

- **Update strategy: `registerType: 'autoUpdate'`.** No "a new version is available,
  reload?" prompt to design or dismiss — the next visit after a deploy picks up the new
  service worker silently, in the background. Matches this app's own low-decision-
  fatigue design (`designs/design-principles.md`) rather than adding a UI choice nothing
  asked for.
- **What's precached (works with zero network):** the JS/CSS/HTML app shell and the PWA
  icons — Workbox's default `globPatterns` in `vite-plugin-pwa`'s `generateSW` mode.
  Every client-side, `localStorage`-backed tool (Pomodoro Timer, Distract Me, Remind Me,
  Timetable, Dopamine Menu, Essay Phrase Bank, and Side Quest Log) keeps working fully
  offline once installed, since none of them need the app shell to be re-fetched or any
  backend call to function.
- **What's deliberately *not* precached:** AI-backed tool calls and signed-in DynamoDB
  sync — both go through the same `runAiTool`/`observeQuery()` backend paths as always,
  and genuinely need a network connection. No offline queueing or optimistic-then-sync
  behavior was added for these; a call made while offline just surfaces the same error
  state `useAiTool.ts`'s `catch` block already produces for any failed network call —
  correct behavior for "the network call failed," which is what offline actually is.
- **Distract Me's ambient audio (`public/audio/*.mp3`, ~7.8MB total) is runtime-cached,
  not precached** — a `workbox.runtimeCaching` rule (`CacheFirst`, 90-day expiry) in
  `vite.config.ts` caches each track the first time it's actually played, not on
  install. Precaching all four tracks up front would make every fresh install download
  audio before the app is even usable, for sounds the user may never choose to play.
- **Icons** (`public/pwa-192.png`, `public/pwa-512.png`, `public/pwa-maskable-512.png`)
  were generated from the existing `public/favicon.png` (the circular hammer/toolbox
  badge already used for the browser tab icon — see "Assets" below for its own
  provenance) via a one-off Pillow script, not committed as a build step: a plain
  upscale for the two standard sizes, and a third "maskable" variant with the badge
  composited onto a solid `--bg`-colored canvas at ~80% scale so an OS home screen can
  crop it to a circle/squircle/rounded-square without clipping the artwork — see the
  [maskable icon spec](https://w3c.github.io/manifest/#icon-masks) for why that inner
  "safe zone" padding matters. Regenerate all three from a new source logo the same way
  if the logo ever changes.
- **`registerSW.js` and the `<link rel="manifest">` tag are auto-injected into
  `dist/index.html`** by the plugin at build time — nothing to maintain by hand in the
  checked-in `index.html`.
- **Verifying it locally:** `npm run build && npm run preview`, then check DevTools'
  Application tab (Service Workers should show `activated`; Manifest should show no
  errors) — `npm run dev` does not register a service worker in most configurations, so
  installability can't be checked from the plain dev server.

## Adding a new tool

1. Create `src/tools/<tool-id>/meta.ts` exporting a `ToolMeta` (id, name, tagline, icon,
   and `category: 'planning' | 'general' | 'study'` — see "Home screen layout" below
   for what decides which one).
2. Create `src/tools/<tool-id>/index.tsx` exporting a `ToolDefinition` (`meta` + a React
   component). Use `useAiTool(meta.id)` from `src/hooks/useAiTool.ts` if the tool calls
   Claude.
3. Add the tool to the list in `src/tools/registry.ts`.
4. If the tool needs Claude: add a `SYSTEM_PROMPTS[<tool-id>]` entry in
   `amplify/functions/ai-assist/handler.ts` describing what the model should do.
5. If the tool needs no AI at all, it can skip step 4 entirely and just do its own thing
   client-side.

That's it — `Home.tsx` renders every tool from `registry.ts` into whichever of its
tabs matches `meta.category` (see "Home screen layout" below); there's no separate
per-tool ordering step within a tab to remember, just that one required field.

No routing, no new Lambda, no new API endpoint required in the common case.

If a tool needs more than one field of input (e.g. Reply Starter's message + tone + length
+ intent), don't change the shared `runAiTool(toolId, input)` schema — instead have the
frontend `JSON.stringify` a small payload into `input`, and register a parser for that
`toolId` in `USER_MESSAGE_BUILDERS` in `ai-assist/handler.ts` to turn it into the actual
prompt. See `src/tools/replyStarter/` and its entry in `USER_MESSAGE_BUILDERS` for the
pattern. Tools that don't register a builder just get `input` passed straight through.
`parseWithFallback`/`joinLabeledLines` (top of `ai-assist/handler.ts`) are the shared
try-JSON-else-fall-back-to-one-field and filter-and-join-labeled-lines steps every
existing `buildXMessage` uses — reach for those instead of writing the try/catch and
`.filter(Boolean).join('\n\n')` by hand again.

A handful of shared frontend helpers exist specifically so a new tool doesn't need to
reinvent a pattern that already has several instances in the codebase — reach for these
before copying an existing tool's version of the same logic:
- `src/lib/parseLabeledOutput.ts` (`makeLabelGetter`/`getBulletList`) — for a tool whose
  AI response is a fixed set of `Label: value` lines (Tone Checker, Call Script, Is This
  Mad?, Time Estimator all use this).
- `src/lib/parseNumberedList.ts` — for a tool whose AI response is a numbered list; splits
  on a lookahead for the *next* numbered item rather than by line, so a multi-line item
  doesn't get silently split in two.
- `src/components/StructuredResult.tsx` — pairs with either of the above: renders a `<dl>`
  of fields if any parsed, or the raw output as a plain-text fallback if none did.
- `src/hooks/useOnceGuard.ts` — the ref-based (not state-based) guard against a fast
  double-click firing a one-shot action (e.g. "Send to Everything Pile") twice.
- `src/hooks/useCopyFeedback.ts` — copy-to-clipboard with a reverting "Copied" label.
- `src/lib/localStorage.ts` (`readStored<T>`) — a `localStorage`-backed tool's read of a
  JSON array, falling back to `[]` on anything missing or malformed.

A signed-in/signed-out context (see "Per-user persistence" above) additionally has
`src/hooks/useSignedOutMirror.ts` for the mirror-to-`localStorage`-while-signed-out /
revert-on-sign-out effect every one of them needs — see `RemindersContext.tsx`,
`TaskStoreContext.tsx`, or `TimetableContext.tsx` for how it's wired in. The
`observeQuery` subscription and first-sign-in migration effects are deliberately *not*
behind a shared hook yet — each context's model is different enough that a generic
version would need real per-model configuration, and three copies of that specific part
wasn't yet a strong enough case to build it ahead of time.

Tools are normally mounted/unmounted as you navigate — fine for stateless tools, but wrong
for anything that needs to keep running in the background (e.g. Distract Me's audio
shouldn't stop just because you switched to another tool). For that, put the actual state
in a React context provider mounted once at the app root (`main.tsx`), not inside the tool
component itself — see `src/context/DistractMeContext.tsx` and how `DistractMeProvider`
wraps `<App />`. The tool's own page just becomes one consumer of that context; a
persistent UI element outside the tool tree (see `src/components/NowPlayingBar.tsx`,
rendered unconditionally in `App.tsx`) can be another.

`src/context/RemindersContext.tsx` is a fuller example of the same pattern for something
that must fire regardless of which tool is open: it owns a `setInterval`-driven check
against reminders persisted in `localStorage`, and `src/components/AlertBanner.tsx`
(also rendered unconditionally in `App.tsx`) surfaces whatever just fired — shared with
`TimetableContext.tsx`'s lesson alerts, since both need the same "fires independent of
what's on screen" surface and every other screen corner was already claimed. If a future
tool needs its own "keeps running / can interrupt from anywhere" behavior, this is the
closer template to follow than Distract Me — it also shows the pattern for a provider
whose state needs to survive a full page reload, not just navigation between tools.

The same pattern extends to global settings that every tool should read, not just
stateful widgets — see `src/context/EnergyContext.tsx` (the Spoons energy level) and its
`EnergyButton.tsx` (rendered unconditionally in `App.tsx`, not a tool of its own). AI tools
pick this kind of global setting up automatically via `useAiTool.ts`, which wraps every
request with the current energy level; see `ai-assist/handler.ts`'s `parseEnvelope` +
`buildEnergyInstruction` for how the Lambda unwraps it once and adjusts response
complexity uniformly, instead of every tool's own builder needing to know about it. A
reusable `src/components/Modal.tsx` backs the popup — reach for it for any future tool
that needs a similar overlay instead of building another one-off.

A tool can also send an image instead of text — see Tone Checker's screenshot feature.
The frontend resizes/compresses it client-side (`src/lib/imageCapture.ts`, capped at
1600px on the long edge) and sends it as `{ imageBase64, mediaType }` JSON, same as any
other structured input. The Lambda has one internal-only toolId, `screenshot-to-text`
(no frontend tile, never in `registry.ts` — Tone Checker calls it directly via a second
`useAiTool('screenshot-to-text')`), whose builder (`buildScreenshotToTextContent`)
returns an image content block instead of a plain string, and skips the energy
instruction entirely since complexity/tone doesn't apply to mechanical transcription.
The extracted text lands back in the same textarea the user would've typed into, so it
flows through the tool's normal (unmodified) analysis afterwards.

A tool can also accept dictated speech instead of (or alongside) typing — see Brain
Dump Sorter's "🎙️ Dictate" toggle. This is entirely client-side via the browser's
native Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`), transcribing
straight into the same text field a user would've typed into — no Lambda call, no
audio ever leaves the browser. TypeScript's bundled DOM lib doesn't declare a
`SpeechRecognition` type of its own, so the tool defines a small local interface for
just the surface it uses rather than reaching for `any`. Feature-detected (the button
only renders when the API actually exists), since browser support isn't universal.

## Roadmap

Ideas for future tools, and what's up next, are tracked in [`TODO.md`](./TODO.md).

## Assets

- The tomato graphic (Pomodoro Timer) is from
  [Twemoji](https://github.com/twitter/twemoji), licensed
  [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The ambient sound loops (Distract Me — rain, sea, cafe, pink noise) are redistributed
  from [Moodist](https://github.com/remvze/moodist) (MIT-licensed), whose own audio is
  sourced from the [Pixabay Content License](https://pixabay.com/service/license-summary/)
  and [CC0](https://creativecommons.org/publicdomain/zero/1.0/) per Moodist's credits.
- The Pomodoro Timer's "pop" sound is from
  [3 Pop Sounds](https://opengameart.org/content/3-pop-sounds) on OpenGameArt.org,
  by Arrall Austin, licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
  (converted from Ogg Vorbis to MP3 for Safari compatibility).
- The "Beth's Gang" logo (`src/assets/logo.png`, `public/favicon.png`,
  `public/apple-touch-icon.png`) was supplied directly by the project owner. Processed
  from the original JPEG with a flood-fill script (background trimmed to transparency,
  not just cropped) and palette-quantized to keep file size down.
- The Essay Phrase Bank tool (`src/tools/essayPhraseBank/phrases.ts`) is original text,
  not copied from anywhere — but its category list (and the general kind of thing each
  category covers, e.g. hedging a claim, conceding a counterargument) took inspiration
  from how existing academic-writing guides carve up the same territory:
  [Academic Phrasebank](https://www.phrasebank.manchester.ac.uk/) (University of
  Manchester), [Transitional Devices](https://owl.purdue.edu/owl/general_writing/mechanics/transitions_and_transitional_devices/transitional_devices.html)
  (Purdue OWL), and [UEfAP](https://uefap.org/) (Andy Gillett). None of their text is
  reproduced here — Purdue OWL's own terms, for instance, say their material "may not
  be published, reproduced, broadcast, rewritten, or redistributed without permission,"
  and Manchester's Phrasebank is for individual use in your own writing, not for
  republishing in another tool — so every phrase in this tool was written fresh for it.
