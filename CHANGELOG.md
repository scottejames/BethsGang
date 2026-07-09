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

### Changed

- **Is This Mad? now also extracts "Asks"** — a fourth field alongside Tone / Most likely
  meaning / Reassurance: a flat bullet list of the concrete asks in the message, with
  emotional framing, guilt-tripping, and filler stripped out (or a single "Nothing — just
  an update" bullet if there's genuinely nothing to act on). This was originally planned
  as a separate **Just The Facts** tool, but building it revealed it was near-identical to
  Is This Mad? in practice — both take a message from someone else and calm it down — so
  rather than ship two very similar tools, the facts-extraction became a fourth field on
  this one instead. Rendered as a nested list inside the existing `.tool-result-fields`
  `<dl>` (new `.tool-result-fields-list` CSS rule) rather than a separate output area.

### Fixed

- **Structured tool output (Is This Mad?, and by extension every dt/dl-rendered tool)
  could break with unrendered markdown.** Confirmed live, by querying the deployed Lambda
  directly and by reproducing against the live site: the model would occasionally wrap
  field labels in markdown bold (`**Tone:**` instead of `Tone:`) or append a whole extra
  unstructured paragraph after the requested fields. This is stochastic and happened
  across low, medium, *and* high Spoons alike — not specific to high energy as first
  suspected (a user report at spoons 9 reproduced it just as reliably as spoons 90 did in
  earlier testing). Since the app's parser matches exact label prefixes and every tool
  renders plain text only, a mislabeled field broke parsing entirely and dumped the raw
  markdown straight to the screen — which is what one user experienced as the app
  "crashing" after pasting a long real message. Fixed at the shared level: added a new
  `FORMAT_GUARD_INSTRUCTION` (plain text only, no markdown, nothing beyond the requested
  format) prepended to every tool's system prompt unconditionally — not gated on energy
  level — plus a smaller wording tweak to the high-spoons instruction so "more thorough"
  reads as more depth within fields, not license to add sections. Verified by querying
  the deployed Lambda directly and repeating the exact user-reported input several times
  after the fix.

## 2026-07-07 (continued)

### Added

- **Tone Checker: paste or upload a screenshot of a conversation** instead of typing it
  out. Paste (Ctrl/Cmd+V) an image directly into the message box, or use the new "Upload
  a screenshot" button; the image is resized/compressed client-side
  (`src/lib/imageCapture.ts`, capped at 1600px) and sent to a new internal-only Lambda
  toolId, `screenshot-to-text`, which transcribes the conversation (attributing "Me:" /
  "Them:" where the screenshot makes it visually clear) using Claude's vision input
  instead of a text prompt. The transcribed text lands in the same textarea the user
  would've typed into — editable before submitting — and then flows through Tone
  Checker's existing analysis completely unchanged. Single screenshot per check for now;
  multi-screenshot (stitching a scrolled thread) was considered and deliberately deferred.
  Built on a branch per explicit request, since this is a bigger architectural stretch
  (first tool to send an image instead of text) than a typical new tool.
  - Verified with Playwright: the full upload→extract→edit→analyze flow end-to-end
    (mocking both backend calls), the clipboard-paste path separately, the extraction
    failure path (friendly error, form stays usable), and that the real resize pipeline
    (not just the mock) produces valid base64 JPEG and actually caps a 3000×2000 test
    image down to a small payload. Plus unit tests for `buildScreenshotToTextContent`
    (image-block construction, validation) and `findImageInClipboard`.

## 2026-07-08

### Added

- **Real logo + a rainbow visual theme.** The hand-drawn "Beth's Gang" logo (supplied by
  the user) now appears on the Home header and as the browser tab favicon/apple-touch
  icon, replacing the old placeholder purple mark. Processed from the source artwork with
  a flood-fill script (`background` trimmed to transparency, not just cropped) so it sits
  cleanly on both light and dark backgrounds, and palette-quantized to keep the PNG small
  despite the JPEG source's compression noise. Sized 10% larger than the first pass and
  set on the same row as the "A small toolbox for getting unstuck" subtitle (new
  `.home-header` flex row), per follow-up feedback that the logo felt small and the
  subtitle isolated on its own line.

### Changed

- **Color theme reworked around the logo's rainbow hammer handle.** New CSS custom
  properties `--rb1`..`--rb6` (light and dark variants) plus `--rainbow-gradient`, sampled
  from the logo. Applied as decorative pop only, never for body text: a colored top bar
  and matching tinted icon badge cycle across the six colors per tool card, a rainbow
  gradient ring wraps the energy (spoons) pill, the now-playing equalizer bars each get a
  different hue, and a short rainbow divider sits under every page heading. The single
  grounding `--accent` action color (buttons, links, focus rings) moved from purple to a
  teal sampled from the logo's wordmark, with a new `--accent-2` (burnt orange, from the
  logo's tagline) used for Call Script's field labels. All new colors were checked for
  WCAG AA contrast where used as text/button-label color (`--accent` ≈ 5:1 on its
  background in both themes); the rainbow colors themselves are decorative-only so don't
  need to clear that bar.
  - Verified with Playwright screenshots of Home and a tool detail page in both
    `light` and `dark` `prefers-color-scheme`, plus `npm run verify`.

### Added

- **Remind Me** — set reminders in plain English ("remind me in 20 mins to have lunch",
  "warn me at 5:30 that I should go home, give me a warning 20 mins before hand");
  one-shot or repeating (daily / weekdays only / every N minutes or hours), with an
  optional warning fired ahead of the actual due time. Shipped with a plain form
  alongside the text entry as a structured fallback, then the form was removed the same
  day per feedback that it looked visually noisy next to the text box — natural language
  already covers the warning and repeat cases the form existed for, so text entry is now
  the only input method. Two new pieces of infrastructure ship alongside the tool itself:
  - `src/lib/reminderParser.ts` turns natural language into a message + time + optional
    warning + repeat rule, using the `chrono-node` library entirely client-side rather
    than the AI Lambda — deliberately, since a reminder firing at the wrong time is a
    worse failure than a tool's text looking odd, and this session already hit real bugs
    from LLMs not reliably following an exact output format (see the "Structured tool
    output... could break with unrendered markdown" entry above). chrono-node itself
    defaults an ambiguous clock time (no am/pm given) to AM and pushes to the next day
    once that's passed, which would turn "at 5:30" asked at 2pm into 5:30am tomorrow
    instead of 5:30pm today — patched with a small resolver that picks whichever of the
    two 12-hour readings is soonest, but only when there's no explicit date/weekday/am-pm
    in the phrase (an explicit "tomorrow at 9" or "next Tuesday at 5:30" is left as
    chrono resolves it, since that's a much less ambiguous case).
  - `src/context/RemindersContext.tsx` is a new global provider (same pattern as
    `DistractMeContext`) that persists reminders to `localStorage` and keeps them firing
    on a 15-second check regardless of which tool is open, surfaced via a new
    `ReminderBanner` mounted unconditionally in `App.tsx` — this is the "global
    alert/notification layer" tracked in TODO.md's Infrastructure section, now shipped.
    A reminder that was already overdue when the tab was closed fires once as a
    "catch-up" the next time the app opens, instead of being silently lost. Also
    requests the browser's Notification permission on first use and fires a real system
    notification best-effort, on top of (never instead of) the in-app banner, which is
    the guaranteed fallback if permission is denied or the API is unsupported.
  - Verified with unit tests for the parser (the user's exact example phrases plus
    several variations and failure cases) and for the provider (fake-timer tests of the
    warning/due/repeat-rescheduling flow and the catch-up-on-mount path), plus a
    Playwright pass driving the real dev server end-to-end — including confirming a
    reminder fires while a completely different tool is open, and that it survives a
    full page reload.
  - **Home screen shows an active-reminder count badge** on the Remind Me tile (a small
    `--accent`-colored circle, top-right corner of the card) so the number of active
    reminders is visible without opening the tool. `ToolCard` gained an optional
    `badgeCount` prop for this rather than a Remind Me-specific component, in case a
    future tool needs the same treatment — `Home.tsx` is the only place that decides
    which tool currently gets one. Includes screen-reader-only text alongside the visual
    badge, since the badge itself is `aria-hidden`.

### Fixed

- **Remind Me's natural-language grammar was inconsistent and confusing.** The original
  shape supported two different leading verbs — "remind me ..." and "warn me AT &lt;time&gt;
  ... give me a warning N mins before hand" — where the second form's "warn me AT" read
  as if the *warning* fired at the stated time, when actually the *reminder* did (the
  warning fired N minutes earlier). Simplified to one consistent grammar: "remind me
  (at/in/before) &lt;time&gt; [to &lt;message&gt;][, warn me N minutes before]" — "remind me" is
  always the leading verb, and "warn me ... before" only ever appears as a trailing
  clause. Also fixed a real bug this surfaced: chrono-node absorbs "at"/"in" into its own
  matched time phrase but not "before" used the same way, so "remind me before 5:30 to go
  home" left a dangling "before" stuck in the parsed message ("before to go home") —
  fixed by stripping a leading "before"/"by" preposition when found immediately before
  the matched time phrase. The Remind Me tool's help text, placeholder, and all tests
  were updated to the new canonical phrasing.

### Added

- **Remind Me defaults to a 15-minute warning for reminders more than an hour away**,
  unless the user explicitly requested a different warning (or none, though there's
  currently no phrasing for "explicitly no warning" — a bare "remind me" without a
  trailing "warn me" clause just gets the default when it qualifies). A reminder due
  within the next hour gets no automatic warning, on the theory that it's soon enough
  to not need one. Implemented in `parseReminderText` itself (not the UI layer) so the
  live preview always reflects exactly what will be created.
- **Reminders that resolve to the past — the reminder itself, or a requested warning —
  are now rejected with a clear, specific error** instead of being silently accepted.
  Two distinct cases: the reminder's own time has already passed (e.g. an explicit past
  date like "remind me on January 1 2020 at 9am to celebrate" — chrono-node's
  `forwardDate` option only resolves *ambiguous* times into the future, it doesn't
  override an unambiguous past one), or the reminder is valid but the requested warning
  offset would itself land in the past (e.g. "remind me in 1 min to have lunch, warn me
  5 mins before"). Both surface through the same `{ ok: false, reason }` failure path
  the parser already used for "couldn't understand this" errors, so the existing
  UI handles them for free: the reason is shown inline, "Set reminder" is disabled, and
  — importantly — the original text stays in the field exactly as typed, so the user can
  edit it and resubmit rather than starting over.
- **The Active Reminders list now shows the reminder time and the warning time as two
  separately labeled lines** ("Reminder: 8 Jul 2026, 21:00" / "Warning: 8 Jul 2026,
  20:45", the latter in an amber accent), replacing a single line with a vague relative
  "warns 20 min before" — the actual clock time of the warning wasn't visible before.
  The live preview text was updated to match ("...— with a warning at ...").
  - Verified with new unit tests (short-fuse reminder + warning both still valid,
    warning-in-the-past rejected, reminder-in-the-past rejected, the auto-warn default
    applying and not applying at the one-hour boundary) and component tests, plus a
    Playwright pass confirming the preview, the error states, and the two-line list
    display against the real dev server.
- **Remind Me accepts noticeably more flexible phrasing**, per a direct request that "in
  an hour and a half" should work. chrono-node handles a lot of casual phrasing natively
  ("in a couple of hours", "in a few minutes", "half an hour", "noon") but a few common
  ones either silently gave the wrong answer or weren't recognised at all — confirmed by
  testing each directly against chrono before writing any fix, rather than guessing:
  - **"&lt;number&gt; and a half hours" was silently wrong** — chrono matched only the
    trailing "half hours" and dropped the number entirely, so "two and a half hours" and
    "one and a half hours" both resolved to exactly 30 minutes. Now rewritten to "N.5
    hours" (which chrono already parses correctly) before chrono ever sees it, for both
    the idiomatic "an hour and a half" (1.5) and "&lt;number&gt; and a half hours" with a
    digit or a spelled-out number (one through twelve).
  - **"quarter of an hour" / "a quarter hour" / "quarter hour"** matched only "an hour"
    (giving 60 minutes instead of 15) or, worse, "a quarter" as a quarter of a *year*.
    Now rewritten to "15 minutes".
  - **"half past five" / "quarter past five" / "quarter to five"** weren't recognised by
    chrono at all (empty result, rejected as unparseable). Now rewritten to plain
    "H:MM" (e.g. "5:30"), which then flows through the same ambiguous-hour resolution as
    any other bare clock time.
  - Fixed two bugs this surfaced in the existing ambiguous-hour resolver while adding the
    above: the hour-12 case (e.g. "quarter to one" → "12:45") wasn't covered by the
    existing 1-11 range check, so it defaulted to 12pm-and-push-to-tomorrow instead of
    the soonest occurrence (extended the resolver to treat 12 as ambiguous between 00:xx
    and 12:xx, careful not to touch "noon"/"midnight" — those chrono keywords report the
    same "uncertain meridiem" internally but the *words* are never actually ambiguous).
    And "at noon"/"at midnight"/"at midday" left a dangling "at" in the parsed message,
    since chrono's match for those keywords (unlike numeric times) doesn't include the
    leading "at" — added to the same leading-preposition stripping "before"/"by" already
    used.
  - All rewrites are confined to the exact matched substring, so they can't shift the
    meaning of the surrounding message text.
  - Added example phrases directly on the Remind Me tool screen, above the text box, so
    the range of accepted phrasing is discoverable without trial and error.
  - Verified with new unit tests for every phrasing above (including the hour-12 edge
    case and the "noon"/"midnight" message-leak fix) and a Playwright pass against the
    real dev server.
- **Usage logging** — a new `log-event` Lambda + `logEvent` AppSync mutation
  (`amplify/functions/log-event/`) record which tools get opened and whether AI-backed
  calls succeed, so it's possible to answer "what are people actually doing with this
  app" from CloudWatch. Deliberately a *separate* Lambda from `ai-assist` rather than
  reusing it — no Anthropic SDK dependency, and its own CloudWatch log group keeps usage
  tracking from getting mixed into Claude API request/response logs.
  - Wired in at exactly two centralized points rather than touching every tool:
    `App.tsx`'s tool-selection handler logs an `opened` event for any tool, and
    `useAiTool.ts`'s `run()` logs an `ai_call` event (success or failure) after every
    AI-backed call resolves — covering every current and future tool with zero
    per-tool code. Non-AI tools (Distract Me, Pomodoro, Remind Me) only get the
    `opened` event for now; action-level events for those would mean per-tool
    instrumentation, tracked as a possible later enhancement in TODO.md rather than
    built now.
  - `src/lib/usageLog.ts`'s `summarizeInputForLogging` decides what "detail" a log line
    carries: short string field values (≤24 chars) are kept as-is (this covers the
    actual fixed vocabulary in this app — tone/verbosity/repeat-kind choices — so it's
    possible to see which options people pick), but longer string values are reduced to
    just `{ length: N }`. Several tools handle real personal content (reminders,
    messages someone sent you, tone-check drafts) — this was a deliberate choice to get
    real behavioral insight without logging the substance of what anyone typed.
  - `sendUsageEvent` wraps its entire call (not just a `.catch` on the resulting
    promise) in a try/catch: caught a real bug in testing where the deployed backend's
    schema was briefly a step behind this code's TypeScript types (the usual case right
    after a schema change lands but before that specific deploy finishes), and calling
    a GraphQL mutation the generated client doesn't yet know about throws *synchronously*
    — which broke tool navigation outright before this fix, since a `.catch` alone only
    handles a rejected promise, not a synchronous throw.
  - Verified with unit tests (the Lambda handler's structured logging and malformed-input
    fallback; the summarization heuristic's short/long/non-string/non-JSON cases) and a
    Playwright pass confirming normal navigation and AI-tool submission still work
    exactly as before with logging wired in.
- **User accounts, Phase 1: auth only** — built on `feature/user-accounts`, not merged to
  `main`, per explicit request to keep this easily discardable: auth is the first time
  this app touches a new AWS service (Cognito) and a real security surface, worth landing
  in isolation before anything depends on it. `amplify/auth/resource.ts` adds
  `defineAuth({ loginWith: { email: true } })` — Cognito email/password, registered
  alongside the existing `data`/`aiAssistFunction`/`logEventFunction` in
  `amplify/backend.ts`. Nothing else changes: `defaultAuthorizationMode` stays `apiKey`,
  and `runAiTool`/`logEvent` remain unauthenticated exactly as before — auth exists for
  identity/session only in this phase, nothing is gated behind it yet.
  - `src/context/AuthContext.tsx` (new) reflects Amplify's own persisted session into
    React — same Context+Provider+hook shape as `EnergyContext`/`RemindersContext` — by
    calling `getCurrentUser()` on mount and subscribing to `Hub.listen('auth', ...)` for
    `signedIn`/`signedOut` events. `src/components/AccountButton.tsx` (new, mirrors
    `EnergyButton.tsx`'s fixed-pill-button pattern, placed top-left — the one open
    corner) is the only UI that reads it: shows "Sign in" or the signed-in email, opens
    a `Modal` containing Amplify UI's `<Authenticator>` (signed out) or an account
    summary + Sign Out button (signed in). Not a login gate anywhere in the app.
  - New dependency `@aws-amplify/ui-react` for the `<Authenticator>`. Themed via a new
    `.amplify-auth-theme` CSS block (`src/index.css`) mapping Amplify UI's `--amplify-*`
    tokens onto this app's existing colors, so it follows both light and dark mode
    automatically without a separate dark-mode block (the underlying app tokens already
    flip; the Authenticator just references them). Needed the more *specific*
    `--amplify-components-authenticator-router-background-color` and matching
    `tabs-*` tokens, not just the general `--amplify-colors-background-primary` — the
    card/tabs ignored the general token entirely and stayed white in dark mode until
    this was found by actually screenshotting both themes, not assumed from the docs.
  - Verified against a real personal sandbox (`ampx sandbox --identifier authtest`) —
    not something a unit test can cover, since it needs a real Cognito user pool.
    `src/context/AuthContext.test.tsx` still covers the React-state-reflection logic
    with mocked `aws-amplify/auth`/`Hub`. For the parts that need a real backend:
    admin-created a confirmed test user (`aws cognito-idp admin-create-user` +
    `admin-set-user-password`, bypassing email verification) to drive a full real
    sign-in → session-persists-across-reload → sign-out round trip with Playwright; separately
    drove the actual sign-up and forgot-password forms far enough to confirm each
    reaches Cognito and lands on its "enter the code we emailed you" screen (matched by
    the exact heading Cognito returns) — completing those two specific flows needs a
    real inbox, not available in this pass. Found and fixed a real Playwright gotcha
    along the way: the Authenticator's email field is `name="username"` on the Sign In
    tab but `name="email"` on the Create Account tab.
  - `TODO.md`'s existing "User accounts (Amplify Auth) + persistent Data model"
    Infrastructure entry is now split: this Phase 1 (auth) is done; Phase 2 (a real
    per-user data model, starting with Reminders, and reworking `RemindersContext` to
    use it) is unstarted and deliberately out of scope for this branch.

### Fixed

- **The Authenticator's typed input text and field labels were nearly invisible in dark
  mode** — reported directly, with a screenshot: typed text in the email field rendered
  as dark navy on a dark navy background. Root cause was a real Amplify UI theming
  gotcha, not a typo in the CSS: every `--amplify-components-*-color` token is defined
  by Amplify's own stylesheet as `var(--amplify-colors-font-primary)` (or similar), but
  that `var()` reference is resolved once, at `:root` — using *Amplify's own default*
  value there, since this app's override only exists on the `.amplify-auth-theme`
  wrapper, a descendant of `:root`. Overriding only the general `--amplify-colors-*`
  tokens (as the original theming pass did) silently does nothing for anything Amplify
  styles via a component-specific token — which turned out to be almost everything
  visible. Worse, the actual input text color goes through *three* layers of this same
  pattern before reaching the rendered element (`fieldcontrol-color` →
  `textfield-color`/`passwordfield-color` on the field wrapper → `input-color` on the
  actual `.amplify-input` element), each one a fresh direct redeclaration that has to be
  overridden individually — found by walking the live DOM's computed
  `--amplify-components-fieldcontrol-color` value element-by-element up the ancestor
  chain in a real dark-mode render, not by reading Amplify's docs. Fixed by directly
  setting every component-specific color token actually in play (field text, field
  labels, headings, body text, validation error text, button/link text) in
  `.amplify-auth-theme`, rather than relying on the general tokens to cascade down. See
  `designs/user-personalization.md` for the full technical explanation, kept there since
  it's a reusable lesson for any future Amplify UI theming, not just this one bug.
  - Verified by reading the actual computed CSS custom property values in a live dark-mode
    render (not just eyeballing a screenshot) to find each redeclaration layer, then
    re-verified visually with Playwright screenshots of both the Sign In and Create
    Account tabs, in both themes, with real typed text — including confirming the
    validation error messages ("Password must have upper case letters" etc.), which had
    the identical contrast bug and got fixed by the same change.
- **Two more instances of the same theming gotcha, reported with a second screenshot**:
  the show/hide-password eye icon was rendering in Amplify's own dark default color
  (near-invisible on the dark card), and the live password-requirements checklist text
  ("Password must have special characters", "Your passwords must match") was a dim,
  low-contrast red rather than the app's `--error` red. Root cause was, again, the
  `:root`-resolution gotcha, but surfacing through two *different* token families that
  hadn't been touched by the previous fix: the eye icon's color is re-pointed by
  `.amplify-passwordfield` from the general `button-color` token to its own
  `passwordfield-button-color` (and a further `passwordfield-button-error-color` variant
  specifically when the field is invalid); the requirements-checklist text isn't a field
  message at all — it's a plain `<p class="amplify-text amplify-text--error">` styled via
  a wholly separate `text-error-color` token, distinct from both
  `fieldcontrol-error-color` (the input border, already fixed) and
  `fieldmessages-error-color` (a third, still-different token for actual field
  validation messages, also newly added here). Confirms the practical rule from the
  first fix: every visually distinct thing Amplify UI renders has its own
  component-specific token, and each has to be found and overridden individually — there
  is no shortcut via the general `--amplify-colors-*` tokens.
  - Found by walking the live DOM ancestor chain of the actual rendered error `<p>` via
    `getComputedStyle` to identify `text-error-color` as the acting token (grepping
    Amplify UI's own `text.css`/`passwordField.css`/`fieldMessages.css` source in
    `node_modules` to confirm the exact default chain), then verified with Playwright
    screenshots in dark mode showing the eye icon and both validation messages clearly
    legible, plus a light-mode screenshot confirming no regression there.

### Added

- **User accounts, Phase 2: persist Reminders + Spoons for signed-in users** — still on
  `feature/user-accounts`, not merged to `main`. Sign-in was previously a no-op (nothing
  read or wrote differently based on who was signed in); this gives it an actual
  purpose. Grepped the codebase first to confirm scope: Reminders and the Spoons energy
  level are the *only* two things that persist anything at all today — everything else
  (Task Breakdown, Tone Checker, Reply Starter, Call Script, Is This Mad?, Pomodoro
  Timer, Distract Me) is stateless and untouched by this change.
  - `amplify/data/resource.ts`: two new owner-scoped `a.model()`s — `Reminder` (mirrors
    the client-side `Reminder` shape, `repeat` kept as a single JSON string field per
    this project's existing schema-evolution approach for structured tool inputs) and
    `UserPreferences` (one row per user, keyed by their Cognito username as a singleton;
    only `spoons` today, named for future per-user preferences without a new model
    each time).
  - `src/lib/dataClient.ts` (new): `generateClient<Schema>({ authMode: 'userPool' })`,
    separate from `aiClient.ts`/`usageLog.ts`'s own clients (those hit `runAiTool`/
    `logEvent`, which stay on the public API key). This authMode override turned out to
    be load-bearing, not stylistic — see "Fixed" below.
  - `RemindersContext`/`EnergyContext`: signed-out behavior is completely unchanged.
    Signed-in state is driven by `client.models.*.observeQuery()` (emits current items
    immediately, then live updates — no manual refetch/polling needed for "added on
    phone, appears on laptop"). Reminders migrate from `localStorage` to the account
    silently on first sign-in per device (no confirmation prompt — chosen explicitly
    over asking first, to match this app's no-interruption philosophy), using each
    reminder's existing id so a second run can't double-upload. Spoons does the
    opposite merge on first sign-in: an existing backend value (a returning user) wins
    over the local device's value, while a brand-new account seeds the backend from
    whatever's currently on the device. Both contexts write optimistically to local
    state first (same instant feel as before either talked to a backend) and reconcile
    against the next `observeQuery` emission.
  - Tests: `RemindersContext.test.tsx` and new `EnergyContext.test.tsx` mock
    `aws-amplify/data`'s `generateClient` plus `useAuth` to cover signed-in/signed-out
    branches, migration and its idempotency, and the create-vs-adopt singleton logic.
    `src/tools/remindMe/index.test.tsx`'s wrapper needed updating too, since
    `RemindersProvider` now calls `useAuth()` internally — any test mounting it (or
    `EnergyProvider`) needs an `AuthProvider` ancestor with `aws-amplify/auth`/
    `aws-amplify/utils` mocked, same as `AuthContext.test.tsx`.
  - Full design writeup, including the migration-UX decision and its reasoning: see
    `designs/user-personalization.md`'s "What Phase 2 built" section.

### Fixed

- **Reminder/Spoons writes were silently failing against the real sandbox** —
  `npm run verify` passed and the UI looked correct (optimistic local state and the
  always-on `localStorage` mirror both made it *look* like everything worked), but
  scanning the actual DynamoDB tables during sandbox verification showed them
  completely empty. Root cause: the Amplify Data schema's `defaultAuthorizationMode` is
  `'apiKey'` (so `runAiTool`/`logEvent` need no per-call override), but
  `Reminder`/`UserPreferences` only permit `allow.owner()` (Cognito). A
  `generateClient<Schema>()` with no explicit `authMode` defaults every call to the
  schema's `defaultAuthorizationMode` — so every create/update/delete/`observeQuery`
  against the new owner-scoped models was being sent with the public API key instead of
  the signed-in user's token, and AppSync correctly rejected all of them with "Not
  Authorized." Fixed by setting `authMode: 'userPool'` on `src/lib/dataClient.ts`'s
  client (used only for these two models). Left as a documented open risk in
  `designs/user-personalization.md` for any future owner-scoped model: **the client's
  default authMode is the schema's, not a specific model's own rule** — has to be set
  explicitly, and the failure mode is silent (no test or casual click-through catches
  it; only checking the actual backend table does).
  - Verified by reading real AppSync response bodies via Playwright's network
    listener (not just the UI) to see the `"errorType":"Unauthorized"` responses
    directly, then re-verified end-to-end after the fix: a reminder and a spoons value
    set while signed in were confirmed via direct DynamoDB scans (not just the UI),
    survived a real page reload, and a second "device" with a pre-existing local
    reminder merged it into the account on sign-in without duplicating anything already
    there.
- **A reminder created while signed in was still fully visible immediately after
  signing out** — reported directly from manual testing (create a reminder, log out,
  it's still there), and correctly flagged as wrong: this is account-scoped data, it
  shouldn't linger on a device once nobody's signed in to that account anymore. Root
  cause was the previous fix's own "sign-out mirroring" design (see above) — it wrote
  every state Reminders was in, including backend-synced account data, into
  `localStorage` continuously while signed in, specifically so sign-out wouldn't
  regress to *stale* local data. That reasoning solved the wrong problem: it stopped
  local data going stale, but at the cost of leaking account data into the
  unauthenticated view. Fixed by never writing to `localStorage` while signed in, and
  explicitly reverting to whatever `localStorage` already holds (from before sign-in,
  untouched by the account session) the moment sign-out happens. Same fix applied to
  `EnergyContext`/Spoons for the same reason, once the pattern was clear.
  - A first attempt at this fix reintroduced the same bug through a subtler path: using
    two separate effects (one mirroring signed-out state to `localStorage`, one
    reverting on sign-out) raced each other on the sign-out transition itself — both
    fire in the same render, and the mirroring effect still saw that render's *stale*,
    still-signed-in `reminders` value (a sibling effect's `setState` doesn't retroactively
    change what an already-running effect in the same commit sees), so it wrote the
    account's data to `localStorage` a moment before the revert effect read it back
    out. Caught by a unit test asserting the exact end state, not by manual
    spot-checking. Fixed by merging both concerns into a single effect, removing the
    race entirely.
  - Verified live end-to-end against the real sandbox: sign in, add a reminder
    (visible), sign out ("No reminders set yet."), sign back in (reminder reappears) —
    with a direct DynamoDB scan confirming the row was never deleted server-side the
    whole time, only ever correctly hidden from the signed-out view.

## 2026-07-09

### Added

- **`utils/user-admin/`** — a standalone admin CLI (`npm run users -- <command>`) for
  managing signed-up users directly: `list-users`, `list-data <user>` (every
  Reminder/UserPreferences row a user owns), `reset-password <user>`, and
  `delete-user <user>` (Cognito account + all their data, cascade-deleted; requires
  typing the user's email back to confirm, since it's irreversible). Not part of the
  app itself — a operator tool, run against whichever sandbox's pool/tables its config
  points at.
  - Deliberately no pool IDs, table names, or credentials in the committed script
    (`index.mjs`) — those live in `utils/user-admin/config.json`, gitignored, created
    automatically with blank fields the first time any command runs against a missing
    config. AWS credentials themselves are never read from a file at all; the tool uses
    the normal AWS CLI credential chain. A `discover` command reads the current
    `amplify_outputs.json` plus a `ListTables` call to suggest what to put in
    `config.json`, since hand-finding a Cognito pool ID and hashed DynamoDB table names
    is exactly the kind of thing worth automating once rather than repeating from memory
    every time (see this file's own 2026-07-08 entries for how much manual
    `aws cognito-idp`/`aws dynamodb` work this session already involved).
  - Owner-matching for `list-data`/`delete-user` works by prefix-matching the `owner`
    field (`"<sub>::<username>"`, Amplify's `allow.owner()` format) rather than assuming
    username always equals sub — resolves the target user's `sub` via `AdminGetUser`
    first (accepts either email or the Cognito username/sub), then scans both tables
    filtering on `begins_with(owner, "<sub>::")`.
  - Verified end-to-end against the real sandbox: `list-users`/`list-data` against the
    real account (read-only, safe); `reset-password` and the full `delete-user` flow
    (including the confirmation-mismatch abort path) verified against a disposable
    throwaway test user created and destroyed specifically for this, seeded with a real
    reminder and preferences row first to confirm the cascade delete actually removes
    them — confirmed via direct `AdminGetUser`/`GetItem` calls afterward that the
    Cognito account and both rows were gone, while the real account's own data was
    completely unaffected throughout.

### Investigated

- **The sign-out data-leak fix (see 2026-07-08's Fixed entry) appeared to only work in
  some browsers** — reported directly: reminders correctly disappeared on sign-out in
  a Firefox-based browser, but stayed visible in Chrome, surviving a hard refresh and a
  new tab. Not a code bug: an incognito window in the same browser showed the correct
  behavior immediately, which pointed straight at persistent `localStorage` rather than
  React/app state (every automated Playwright test already passes because it always
  runs in a fresh, empty browser context — effectively incognito by construction, so it
  could never have caught a bug that only exists in stale profile state). Root cause:
  this feature's own development churned through several different Cognito sandbox
  pools (see 2026-07-08's "duplicative Cognito instances" cleanup), and the affected
  browser profile had been used across all of that, leaving stale `localStorage`
  content that looked identical to the original leak bug. Resolved by clearing site
  data for the dev origin in that browser (not fixed by restarting the browser itself —
  `localStorage` is written to disk and survives a full restart). Documented in
  `OPERATE.md` as a "check incognito first" troubleshooting step for any future
  browser-specific-looking bug report during local dev.

### Fixed

- **The account modal stayed open after a successful sign-in**, landing on a bare
  "Signed in as X" panel with only a Sign out button and no obvious way to dismiss it
  (Escape or click-outside worked, but neither is discoverable) — reported directly as
  "seems dumb." `AccountButton.tsx` never closed its own modal once the Authenticator
  completed sign-in; `open` state just stayed `true` through the transition. Fixed by
  closing the modal automatically the moment `isSignedIn` flips true — the account
  button itself already updates to show the signed-in email, which is confirmation
  enough without an extra dialog sitting there. Clicking the button again still opens
  the signed-in panel (with Sign out) on demand, unchanged.
  - Verified against the real sandbox with a disposable test user: modal closes
    immediately after sign-in (screenshot confirms the app is fully visible, account
    button shows the email, no dialog left open), and reopening it still shows the
    Sign out panel correctly.

### Added

- **Shared Task Store + Park My Sidequest** — the ⭐ "Shared Task Store" infrastructure
  idea from this file's own backlog (a canonical list of tasks other tools can
  eventually feed into, instead of every list-producing tool throwing its output away),
  built now and shipped with its first consumer.
  - `src/context/TaskStoreContext.tsx` (new): `Project` (`id`, `name`, `createdAt`) and
    `Task` (`id`, `title`, optional `projectId`, `size: 'small' | 'large'`,
    `category: 'now' | 'later' | 'not-your-problem'`, `done`, `createdAt`). Same
    Context+Provider+hook shape as `RemindersContext`/`EnergyContext`, mounted at the
    app root in `main.tsx` (not tool-scoped) so any future tool can read/write the same
    store without needing Park My Sidequest itself open. `localStorage`-backed only
    this pass — a per-user backend model is a natural later phase, same incremental
    path Reminders/Spoons already took, deliberately not part of this one.
    `projectId` is optional by design: a task can stand alone (quick-capture, no
    project chosen), matching the "Side Quest Log" backlog idea this tool grew out of
    and keeping the model usable by any future tool that just wants to drop in a bare
    task without a project to attach it to. Deleting a project detaches (not deletes)
    its tasks — they become project-less rather than being silently destroyed.
  - **Park My Sidequest** (`src/tools/parkMySidequest/`, 🎒): a project/chip filter row
    (with inline "+ New project"), an add-task form (title, a Small/Large size toggle,
    a Now/Later/Not Your Problem category select), and a three-section task board (one
    per category) with per-task done-checkbox (struck through and sunk to the bottom of
    its section rather than disappearing, so it stays visible as a record), a
    category-move select for quick re-triage, and delete.
  - Deliberately **not** wired into any existing tool yet, per explicit scope — no
    "Send to Tasks" button on Task Breakdown or anywhere else. That's tracked
    separately in `TODO.md`'s "Linking tools together" section, now unblocked but still
    unstarted.
  - Tests: `TaskStoreContext.test.tsx` covers add/update/delete for both projects and
    tasks, the detach-on-project-delete behavior, and reading previously-stored data on
    mount. `parkMySidequest/index.test.tsx` drives the actual component (Testing
    Library): standalone vs. project-tied tasks land in the right category section,
    re-triaging via the per-task select, deleting a task, and deleting a project
    leaving its task behind.
  - Verified against the real running app with Playwright: created a project, added
    tasks in all three categories (some standalone, one tied to the project),
    re-triaged one, marked one done, deleted the project and confirmed its task
    survived (now project-less), and confirmed everything survives a full page
    reload — re-navigating into the tool after reload, since this app has no router and
    a reload always resets to the Home screen (not a bug, just how verification needed
    to account for existing app behavior).
  - One real test-script bug worth recording, not an app bug: an early verification
    script used `button:has-text("All")` to click the project filter's "All" chip, which
    is ambiguous — `ToolShell.tsx`'s existing back button reads "← All tools", also
    matching a substring `has-text` selector, so the script was silently clicking back
    to the Home screen instead. Looked exactly like the tool losing its own input field
    (30-45s locator timeouts on the next step) and was initially mistaken for
    Playwright/system-load flakiness before being traced to the actual selector
    ambiguity. Fixed by scoping to the `.project-chips` container with an exact-text
    role query.

### Changed

- **Park My Sidequest: rewrote the UI as a project/task tree** — direct feedback on the
  first version: "projects need to be more directly tied to tasks. A project is
  composed of a set of tasks. I would like to see more of a tree structure." The
  previous layout treated a project as a filter chip (select one to narrow a shared
  three-category board); the new one makes each project a real container. Data model
  (`TaskStoreContext`) is completely unchanged — this was a presentation-only rewrite
  of `src/tools/parkMySidequest/index.tsx` and its CSS.
  - Each `Project`, plus a synthetic **"Unfiled"** group (always present, no delete
    button) for tasks with no `projectId`, renders as a collapsible section: a header
    (chevron, name, task count, delete for real projects) and, when expanded, its own
    scoped "add task" row and task list. Adding a task from inside a group's row
    always ties it to that group's project (or leaves it standalone inside Unfiled) —
    there's no more implicit "currently selected project" to track separately from
    what's on screen.
  - Category (Now/Later/Not Your Problem) is no longer a top-level grouping — confirmed
    via a clarifying question, to keep the tree at one level of depth rather than
    Project → Category → Tasks. It's now a small colored tag per task (reusing the
    same `<select>` for re-triage as before, restyled) — red for Now, amber for Later,
    green for Not Your Problem. Tasks within a group still sort by category priority
    then done-status (undone first, done sunk to the bottom, struck through — unchanged
    from before) so scannability isn't lost by dropping the second nesting level.
  - Deleting a project still detaches rather than deletes its tasks (no
    `TaskStoreContext` change needed) — they simply reappear under Unfiled on the next
    render, now visibly so instead of just "surviving" behind the old filter-chip UI.
  - Collapsing/expanding is per-group, default expanded (confirmed via the same
    clarifying question) — a real tree affordance rather than everything being
    permanently visible regardless of how many tasks a project accumulates.
  - Tests: `index.test.tsx` fully rewritten for the new structure (`TaskStoreContext`'s
    own tests were untouched, confirming the data layer genuinely didn't need to
    change) — standalone vs. project-tied tasks land in the right group, re-triage,
    delete, done-sinks-to-bottom, collapse/expand hiding and restoring a group's
    content, and project deletion moving tasks into Unfiled.
  - Verified against the real running app in both themes: two projects plus a
    standalone task populate the tree correctly, re-triage and done-marking both work
    in place, collapsing/expanding a project toggles its content, deleting a project
    moves its task into Unfiled, and everything survives a full reload (re-navigating
    into the tool afterward, same as before — this app has no router).
  - A second instance of the same class of test-script bug as the earlier "All"/"All
    tools" one: a dark-mode verification script's `getByLabel('Category')` matched
    *two* elements — the group's own add-row select (`aria-label="Category"`) and a
    task's re-triage select (`aria-label="Move \"...\" to a different category"`),
    since accessible-name label queries do case-insensitive substring matching by
    default and the word "category" appears in both. Fixed with `{ exact: true }`.
    Worth remembering as a general pattern: any two accessible names sharing a common
    word are a latent Playwright ambiguity, not just exact substring matches like
    "All"/"All tools" was.

### Added

- **Park My Sidequest: full edit lifecycle for Projects and Tasks** — prompted by
  auditing the widget's CRUD completeness end to end: Projects had create/read/delete
  but no rename, and Tasks could only have their category and done-status changed after
  creation — title, size, and which project (if any) owned a task were all frozen at
  creation time. Fixed all three gaps in one pass, plus the ability to move a task
  between projects (or in/out of Unfiled), since re-parenting a task is really the same
  operation as reassigning any other field.
  - `TaskStoreContext`: new `updateProject(id, { name })`, and `updateTask`'s patch
    type broadened to also accept `title` and `projectId` (previously only
    `size`/`category`/`done`). Moving a task to Unfiled is just `{ projectId:
    undefined }` — the same mechanism as moving it to any other project.
  - **Project rename**: a pencil button next to each project's delete (×) button in the
    group header (Unfiled has neither, same as before — it isn't a real project) swaps
    the header for an inline rename form (text input, Save, Cancel; Escape also
    cancels). Renaming doesn't touch any of that project's tasks.
  - **Task edit**: a pencil button on each task row (next to Delete) swaps that row for
    an inline form: title, the same Small/Large size toggle used by the add-task row
    (pulled into a shared `SizeToggle` component so the two places a task's size can be
    set don't drift apart), and a Project select (every project plus "Unfiled") for
    re-parenting. Category and done-status are unchanged by this — they're already
    directly editable at all times via the existing tag-select and checkbox, so edit
    mode is specifically for the three fields that were previously frozen.
  - Tests: `TaskStoreContext.test.tsx` covers `updateProject` and the broadened
    `updateTask` (title change, moving between two real projects, and back to
    standalone). `index.test.tsx` covers renaming a project (and cancelling), editing a
    task's title/size in place, moving a task between projects and back to Unfiled via
    the edit form, and cancelling a task edit leaving the original untouched.
  - Verified against the real running app: renamed a project, edited a task's title and
    size, moved it to a different project via the edit form, confirmed cancel discards
    without saving, and confirmed the rename and the move both survive a full reload.
  - A second test-script locator bug of the same shape as before, worth generalizing
    the lesson from further: a verification script located a task row with a
    `hasText`-filtered locator, entered edit mode (which replaces the title *text* with
    an `<input value="...">`), then tried to re-use the *same* `hasText` locator to find
    the now-open edit form — but Playwright locators re-evaluate lazily on every
    action, and an input's `value` isn't text content, so the locator matched nothing
    the second time. Fixed by locating the row positionally
    (`.task-item.first()`) once there's only one candidate, rather than by text that
    the action itself was about to change.

### Fixed

- **Park My Sidequest: the category tag dropdown was unreadable when open** — reported
  directly: "the colour scheme on the drop down ... is hard to read." Every screenshot
  taken while building the tag styling only showed the *closed* pill, which looked
  fine (colored text on a light tinted background). Opening the actual dropdown showed
  the real bug: browsers apply a `<select>`'s own `background`/`color` to its entire
  open `<option>` list by default, not just the closed state, so each category tag's
  translucent tinted pill background (`color-mix(..., transparent)`, designed to sit on
  the app's own surface color) turned into a low-contrast wash behind every option —
  dark, barely-legible text on a pink/amber/green tint for whichever category wasn't
  currently selected. Fixed by explicitly styling `.category-tag option` back to plain
  `var(--surface)`/`var(--text)`, so the color-coding stays on the closed pill without
  leaking into the open list. Verified by actually opening each dropdown in a real
  render (not just screenshotting the closed state) in both themes.

### Changed

- **Park My Sidequest: "Unfiled" renamed to "Parking Lot", and moved to always be the
  first group** — asked directly what Unfiled was actually for, which surfaced that its
  purpose (a home for standalone tasks, and a landing zone for tasks whose project got
  deleted) wasn't obvious from the name, and that it read as just another
  project-shaped section rather than the tool's actual default/quick-capture home. Pure
  rename plus a reorder — `UNFILED_ID` (the internal sentinel used as the "move to
  Parking Lot" option's value) is unchanged, only the displayed `UNFILED_NAME` and the
  groups array's order changed. Being first now matches the name: it's the place you'd
  reach for by default, not something tucked below every project.
  - Test added specifically for the ordering (`index.test.tsx`): Parking Lot always
    renders before every project, regardless of how many exist.
  - Verified against the real running app: with two projects present, Parking Lot
    renders first in the tree, both before and after adding projects.

### Changed

- **Home screen: removed the DOING/SAYING tool grouping, made the grid genuinely
  responsive** — reported directly as "looking a bit LONG" and not using space
  efficiently. Two separate problems, both fixed:
  - `Home.tsx`'s `DOING_GROUP`/`SAYING_GROUP` id lists (explicit "which tools feel
    similar" curation, requiring a manual step whenever a tool was added) removed
    entirely, per direct instruction — tools now render straight from
    `registry.ts` in registry order, into a single grid, with no grouping/ordering
    logic left in `Home.tsx` at all.
  - The real reason the page felt long even after that: `#root`'s `max-width: 720px`
    (a deliberate reading-width cap for tool content — forms, text areas, AI output)
    was applying to *everything* under it, including Home's card grid, capping it at 2
    columns regardless of how wide the actual browser window was. Moved that
    constraint down to `.tool-shell` specifically (tool screens keep the exact same
    720px behavior, unchanged) and gave `.home` its own wider 1100px cap instead,
    since a card grid doesn't have the long-line-length readability concern that
    justified 720px for text content in the first place.
  - `.tool-grid` switched from `auto-fill` to `auto-fit` in
    `grid-template-columns: repeat(_, minmax(220px, 1fr))` so existing cards stretch
    to fill a row instead of leaving reserved-but-empty column tracks when the tool
    count doesn't divide evenly — verified this was actually the better choice by
    comparing both against the real card count (9) rather than assuming.
  - The old two-column-only layout is gone along with the two-column-specific rainbow
    nth-child color-cycling selectors (`.tool-column .tool-card:nth-child(...)`,
    `.tool-grid .tool-card:nth-child(...)`) — now a single set of `.tool-grid
    .tool-card:nth-child(...)` rules.
  - Verified with Playwright across four viewport widths against the real running
    app (no media queries needed — CSS Grid's `auto-fit` handles all of it): 1 column
    at 375px, 3 at 768px, 4 at 1024px and 1600px (capped by `.home`'s own max-width on
    very wide screens, so cards don't spread out absurdly thin on an ultrawide
    monitor). Confirmed in both themes, and confirmed `ToolShell`'s width is
    unaffected (still exactly 720px at a 1600px viewport).

### Added

- **Park My Sidequest ↔ Task Breakdown, wired together** — the first concrete link
  from `TODO.md`'s "Linking tools together" list, previously deferred by explicit
  choice when Park My Sidequest first shipped. A project can be sent to Task Breakdown
  to get broken into steps, and the steps can be sent back — smart about *where*: into
  the *same* project if that's where the session started, or a new project if Task
  Breakdown was opened standalone. This was the actual ask: "differentiate between
  tasks that are initiated in [Task] Breakdown (creates a new project) and projects
  that come FROM sidequest ... the breakdown should be within the existing project."
  - `src/context/ToolNavigationContext.tsx` (new): promotes `activeToolId` out of
    `App.tsx`'s local `useState` into a proper Context (`navigateToTool`/`goHome`),
    since nothing previously let one *tool* send the user to another — only `Home`
    could. This is the actual prerequisite this feature needed, and it's reusable for
    every other link in `TODO.md`'s list, not something built one-off for this pair.
    Also where the "opened" usage-log event fires now (moved out of `App.tsx`), so
    tool-to-tool navigation is logged exactly like Home-click navigation, with no
    separate path to forget.
  - The same context carries one small, specifically-typed handoff —
    `pendingBreakdownRequest` (`projectId`, `projectName`, `prefillText`) — set by
    Sidequest right before navigating, read and cleared by Task Breakdown in a
    mount-only effect. Deliberately not a generic "any payload for any tool" system;
    narrow and named, easy to extend with another slot like it if a second link needs
    one.
  - `TaskStoreContext.addProject` now returns the created `Project` instead of `void`
    (existing call sites unaffected — they already ignored the return value) — what
    lets Task Breakdown create a new project and immediately use its id in the same
    call, without waiting on a re-render.
  - Park My Sidequest: a 🧩 button in each project's header (real projects only, same
    as rename/delete — Parking Lot doesn't get one) hands the project off and
    navigates. Task Breakdown: the textarea pre-fills with the project name; once
    there are steps, a button appears labeled `Add to "<project>"` (handoff-originated)
    or `Send to Sidequest` (standalone) — same underlying action either way, just a
    different target project id. Every pushed task is `size: 'small'`,
    `category: 'now'`, matching Task Breakdown's own framing ("small, concrete,
    startable steps" you just asked to start on). Step titles reuse the exact same
    `^\d+\.\s*` numbering-strip already applied when rendering each step, so the
    stored title and the displayed text can't drift apart.
  - Tests: `ToolNavigationContext.test.tsx` (new) covers navigate/goHome/usage-logging
    and the handoff round-trip. `TaskStoreContext.test.tsx` extended to assert
    `addProject`'s return value. `parkMySidequest/index.test.tsx` extended (now needs
    `ToolNavigationProvider`, same as it needed `AuthProvider` when Reminders/Energy
    gained a new dependency) with a test asserting the 🧩 button's handoff. New
    `taskBreakdown/index.test.tsx` (this tool had no committed test before) mocks
    `runAiTool` directly and covers both branches — standalone send creates a new
    project, handoff-originated send adds to the existing one with no duplicate.
  - Verified against the real running app with the AppSync GraphQL call intercepted
    (`page.route`, returning a canned breakdown) rather than needing a live sandbox —
    same approach already used for other AI-tool verification in this project: sent a
    real Sidequest project through the full round trip (🧩 → pre-filled → break down →
    add back) and confirmed exactly one "Kitchen reno" group with the new tasks, no
    duplicate; separately, a standalone Task Breakdown session confirmed a brand-new
    project gets created and named after the task text.
- **Dopamine Menu** — the ⭐ tool idea from this file's own `TODO.md` research, built
  now: a short, user-curated, editable list of "quick, easy, low-effort things that
  reliably feel good" (stretch, step outside, a favourite song), plus a "🎲 Surprise
  me" button that reveals one at random. Targets decision fatigue directly — the whole
  point is a shortcut past "what do I even do right now" straight to something
  rewarding, not a points/streaks economy.
  - `localStorage`-backed only, no AI and no shared Context — the first tool in the app
    to persist its own state directly rather than through a root-mounted
    Context+Provider, since (unlike Reminders/Spoons/the Task Store) nothing else needs
    to read or write this list yet. `TODO.md`'s "Dopamine Menu ↔ Pomodoro" link is a
    natural candidate to promote this into a shared Context later, if that gets built.
  - Seeded with 8 short default items only the very first time the app runs (the
    `localStorage` key is entirely absent) — a key present but holding an empty array
    means the user deliberately cleared their list, and is left alone rather than
    silently reseeded.
  - "Surprise me" avoids repeating the same item twice in a row when another one
    exists, so mashing the button doesn't just show the same suggestion back.
  - Verified with unit tests (seeding, add/delete, reorder, the no-repeat reveal logic,
    and the "deliberately emptied list stays empty" case) and by driving the real
    running app with Playwright in both light and dark theme (add an item, surprise
    me, confirm no console errors).

### Fixed

- **Remind Me's Home-screen tagline still described a "simple form"** that was built
  and removed the same day it shipped (see this file's 2026-07-07 entry and
  `designs/remind-me.md`'s "The plain form was built, then removed the same day" note)
  — the tool itself was already correct (its in-tool intro only ever mentions the
  plain-English input), but `meta.tagline` never got updated, so the stale claim sat on
  every Home-screen tool card. Found by an explicit audit of every tool's tagline,
  in-tool intro text, and field labels against actual current behavior — the only stale
  one out of 10 tools. Now reads "Set a reminder in plain English — no fields to fill
  in."

### Changed

- **Dopamine Menu's list is now hidden by default** — reported directly: the full
  editable list shouldn't be the first thing shown. Surprise me and a small "✎ Edit
  list" toggle are now the only things visible until the user deliberately asks to see
  or edit the list (button then reads "Done editing"); Surprise me's reveal works
  either way, independent of whether the list is open. The one exception: if the list
  is empty there's nothing to hide, so the add form opens automatically rather than
  leaving no visible way to add the very first item (and the toggle button itself is
  hidden in that case, since there's nothing to toggle). Verified with unit tests
  (hidden by default, opens/closes on toggle, forced open when empty) and by driving
  the real running app with Playwright.
