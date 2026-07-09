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
