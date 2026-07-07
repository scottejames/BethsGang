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

## 2026-07-07

### Added

- **White Noise** tool — play Rain, Sea, or Cafe ambience in the background (`public/audio/`,
  see README "Assets" for licensing). First tool that needs to keep running while you use
  other tools, which required a real architecture addition rather than just a new tool
  folder:
  - `src/context/WhiteNoiseContext.tsx` — a `WhiteNoiseProvider` mounted once at the app
    root (`main.tsx`, wrapping `<App />`) that owns a single persistent `<audio>` element.
    Because it lives above the tool-mounting point in the tree, it survives navigating
    between tools (which normally mount/unmount their own UI).
  - `src/components/NowPlayingBar.tsx` — a small persistent player (icon, sound name, a
    tiny animated "equalizer bars" indicator, volume slider, stop button) rendered
    unconditionally in `App.tsx` so it's visible on Home and every tool, not just the
    White Noise page itself.
  - Only one sound plays at a time (picking a new one switches, doesn't layer) — kept
    deliberately simple for v1; documented in the README as the pattern to follow for any
    future tool that needs persistent background state.
- Audio sourcing research: no public "white noise as a service" API exists for embedding
  (checked Noisli, White Noises, Moodist, noises.online, A Soft Murmur, Rainy Mood — all
  are destination web apps, none expose a documented third-party API). Self-hosting
  verified, appropriately-licensed loops was the responsible choice over hotlinking
  someone else's live site.
- Home screen tile order: White Noise and Pomodoro Timer now come first, ahead of Task
  Breakdown / Tone Checker / Reply Starter.
- Pomodoro Timer: a "Visualise remaining time" toggle. When on, the tomato continuously
  shrinks (scale, not a fixed animation) in proportion to time remaining instead of the
  usual pulse, holding at a minimum size near the end so the shrink stays visible for the
  whole countdown rather than vanishing early — then plays a short "pop" sound
  (`public/audio/pop.mp3`, see README "Assets") with a quick scale-up-and-fade animation
  the instant the timer hits zero. Off by default; existing pulse-while-running behaviour
  is unchanged when the toggle is off.
- **Spoons energy level** — a global 0-100 "Spoon Theory" energy picker, deliberately not a
  tool tile: a small `🥄 NN` button rendered once at the app root (`EnergyButton.tsx`),
  visible on Home and every tool, opening a light-hearted popup (`Modal.tsx` — new,
  reusable) with a slider, a row of 10 spoon emoji that fill in proportionally, and a
  caption ("Running on fumes" → "Fully loaded"). Persisted to `localStorage`
  (`EnergyContext.tsx`), default 70.
  - Every AI tool automatically picks this up: `useAiTool.ts` wraps whatever a tool sends
    as `{spoons, input}` before calling `runAiTool`; `ai-assist/handler.ts` unwraps that
    envelope once and prepends a single shared low/medium/high instruction ("keep it
    simple" / "usual detail" / "can be more thorough") before the tool-specific message.
    No changes needed in Task Breakdown, Tone Checker, or Reply Starter themselves, and
    any future AI tool gets this for free.
  - Non-AI tools (Pomodoro, White Noise) don't have a generated response to adjust, so
    they're unaffected beyond the button being visible everywhere.
  - Verified with Playwright screenshots (popup rendering, live slider updates, badge
    persisting across navigation) and isolated Node tests of the envelope
    parse/unwrap/bucket-boundary logic.

### Changed

- Task Breakdown's tagline and system prompt now say "big task" instead of "overwhelming
  task."

### Fixed

- Pomodoro Timer's "Visualise remaining time" control was a button styled identically to
  the duration presets, wrapping directly beneath them with almost no gap — it read as a
  4th duration choice instead of a separate setting (caught from a screenshot). Replaced
  with a proper toggle switch (checkbox + styled track/thumb) with clear spacing above it,
  and verified with real screenshots (Playwright + a cached Chromium build) in both light
  and dark themes.
- The pop sound was firing twice when the timer completed with "Visualise remaining time"
  on. Cause: `setStatus('done')` and the `Audio.play()` call lived inside the *functional
  updater* passed to `setRemainingSeconds`, which isn't guaranteed to run exactly once —
  React's `StrictMode` (the whole app is wrapped in it) deliberately double-invokes state
  updater functions in development specifically to catch impure updaters like this one.
  Moved the completion side effects out of the updater and into the interval callback
  itself, reading the current value via a ref instead. Verified with a headless-browser
  test (Playwright's clock API to fast-forward the countdown, intercepting
  `HTMLMediaElement.play()` to count calls) that it now fires exactly once, and that it
  doesn't fire at all when the toggle is off.
- Writing a committed test for the fix above (see "Added") surfaced a second, subtler bug
  in the same area: the ref-sync approach from that fix only updates the ref inside a
  `useEffect`, which commits *between* renders — under tight/rapid ticks the ref could lag
  and the zero-check would never fire, leaving the countdown stuck at "0:00" without ever
  reaching `done`. Rewrote the interval to count down a plain local variable captured once
  when the countdown starts/resumes, entirely inside the interval closure, with no
  dependency on React's render/effect timing for correctness.

### Added

- `npm run verify` — one command chaining lint, a typecheck of the Amplify backend
  (`amplify/tsconfig.json`, a real committed config replacing the scratch one used while
  developing this session), the frontend build, and the test suite below.
- A test suite via [Vitest](https://vitest.dev/) (`npm test`), configured in
  `vite.config.ts`. Two tests, both formalizing verification that had only been done ad hoc
  earlier this session: `amplify/functions/ai-assist/handler.test.ts` (envelope
  parsing/energy bucketing/message builders — pure functions, run in a plain Node
  environment via a per-file `@vitest-environment node` override, since the Anthropic SDK
  refuses to construct under the project's default jsdom environment) and
  `src/tools/pomodoroTimer/index.test.tsx` (the pop-sound regression test above, using
  Testing Library + fake timers — this is what surfaced the second bug it fixed).
- `OPERATE.md` — day-to-day build/test/run commands (the `verify`/`test`/
  `typecheck:amplify` scripts above, `runLocal.sh`, sandbox-vs-deployed isolation),
  separated out from `README.md` so that file can stay focused on architecture and
  deployment. Linked from the top of `README.md`.
- `.claude/skills/update-project-artifacts/SKILL.md` — a project skill that triggers
  after any significant feature/fix, walking through updating CHANGELOG.md, TODO.md,
  README.md, and OPERATE.md, running `npm run verify`, and checking `git status` before
  handing back to the user. Formalizes the checklist this file's own history motivated
  (see the `npm ci`→`npm install` and missing-Reply-Starter-files entries above for why).

### Fixed

- `.gitignore` blanket-ignored all of `.claude/`, which would have silently excluded
  `.claude/skills/` (and any future `.claude/commands/`) from the repo — the opposite of
  what's needed for a project skill to actually be shared. Narrowed the ignore to the two
  actual local/personal files (`settings.local.json`, `scheduled_tasks.lock`).

### Added

- **Call Script** tool — describe what a phone call needs to accomplish, pick a tone, and
  optionally say who it's to; get back a short script (Opening / Main point / If they ask
  more / Closing) meant to be read from during the call itself. Targets phone calls
  specifically because they're disproportionately avoided even by people who don't
  otherwise procrastinate — the script hands over the standard social conventions (how to
  open, how to close) so only the actual content of the call needs improvising. Reuses the
  `Tone`/`TONE_LABELS` already built for Reply Starter (generalized out of that tool's own
  input type rather than duplicated). Automatically respects the Spoons energy level with
  zero tool-specific code, via the existing shared envelope mechanism. Result text is
  rendered larger than the app's other tool outputs (`.call-script-fields`), since this
  one is meant to be read aloud in the moment rather than skimmed.
  - Verified with a Playwright test that mocks the AppSync response (rather than needing
    a live sandbox) to confirm the four script sections parse and render correctly
    end-to-end, plus 3 new unit tests for the message builder.

### Changed

- **White Noise renamed to Distract Me**, and a **Pink Noise** sound added alongside
  Rain/Sea/Cafe (same source and licensing as the existing three — see README "Assets").
  Renamed thoroughly rather than just the display label, so the codebase doesn't end up
  with a "Distract Me" tool whose files are all still named `whiteNoise`:
  `src/tools/whiteNoise/` → `src/tools/distractMe/` (via `git mv`, preserving history),
  `WhiteNoiseContext.tsx` → `DistractMeContext.tsx` (`WhiteNoiseProvider`/`useWhiteNoise` →
  `DistractMeProvider`/`useDistractMe`), tool id `white-noise` → `distract-me`, and the
  `.white-noise-controls` CSS class → `.distract-me-controls`. Updated every
  cross-reference (`main.tsx`, `NowPlayingBar.tsx`, `registry.ts`, and the two places in
  README.md that used White Noise as the worked example for the persistent-Context
  pattern). Verified with Playwright screenshots (home tile, tool page, and the mini-player
  actually playing Pink Noise) rather than assuming the rename was complete because the
  build passed.
- Home screen now groups tiles by feel instead of one flat `auto-fill` grid: Distract Me /
  Pomodoro Timer / Task Breakdown ("doing" tools) in one column, Reply Starter / Tone
  Checker / Call Script ("saying" tools) in the other. Implemented as two explicit
  `.tool-column` flex columns rather than relying on array-index/grid-column math, since
  the previous grid's column count depends on viewport width — an interleaved-array trick
  would only land the grouping correctly at exactly one column count and silently scramble
  it at any other. Verified with screenshots at both a desktop width (two columns, correct
  grouping) and a narrow width (columns stack, grouping still holds top-3/bottom-3 rather
  than interleaving). A tool not added to either group in `Home.tsx` still renders, in a
  fallback grid below the two columns, rather than silently vanishing from Home.

### Added

- **Is This Mad?** tool — the mirror image of Tone Checker: paste a message *someone else*
  sent *you* (plus optional context) and get a calm, literal read (Tone / Most likely
  meaning / Reassurance) instead of the worst-case interpretation. Targets
  rejection-sensitive-dysphoria spirals directly — the system prompt explicitly instructs
  the model to default to the least alarming reasonable reading and not validate a
  catastrophizing interpretation even if the given context suggests the user is anxious
  about it. Reuses the exact same architecture as Tone Checker (structured
  message+context JSON input, `.tool-result-fields` output rendering) and automatically
  respects the Spoons energy level via the existing shared envelope, with zero
  tool-specific code. Grouped with the other "saying" tools on Home, directly after Tone
  Checker. Verified with a Playwright test that mocks the AppSync response end-to-end,
  plus unit tests for the message builder.
