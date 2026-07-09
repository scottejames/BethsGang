# Tool ideas backlog

Ideas for new tools, roughly in build order. See README.md "Adding a new tool" for the
mechanics — most of these are just a new system prompt away.

## Up next

- [ ] **Side Quest Log** — a one-line quick-capture parking lot for stray thoughts that
      pull your attention mid-task. Add a line, keep working, come back to a running list
      later to triage (do it / bin it / turn it into a real task). No AI needed — pure
      client-side tool backed by `localStorage`, first tool in the app that isn't
      AI-backed. Good proof that the framework isn't AI-only.
~~- [ ] **Is This Mad?**~~ — shipped, see Shipped below.
~~- [ ] **Just The Facts**~~ — merged into Is This Mad? rather than shipped separately,
      see Shipped below.

## Shipped

- [x] **Reply Starter** — stuck on a message you owe a reply to; get 3 short, low-effort
      draft replies (with a one-click copy button) to break initiation paralysis. Now also
      has Tone / Length / optional intent controls.
- [x] **Pomodoro Timer** — 5/10/15 min presets, stop/resume, reset, pulsing tomato graphic
      while running. Now also has a "Visualise remaining time" toggle: tomato shrinks in
      proportion to time left instead of pulsing, then pops (sound + animation) at zero.
      No AI/sandbox dependency — fully client-side. Covered by
      `src/tools/pomodoroTimer/index.test.tsx` (fake timers + mocked audio) and verified
      with Playwright screenshots in both themes.
- [x] **Tone Checker context field** — optional "Context" box (who it's to / what's going
      on) to sharpen the read, phrased low-pressure and factual on purpose.
- [x] **Distract Me** (originally shipped as "White Noise Widget", renamed) — Rain / Sea /
      Cafe / Pink Noise loops, persistent across tool navigation via a `DistractMeProvider`
      at the app root + a global mini-player. One sound at a time for v1; layering multiple
      sounds is a possible later enhancement. No AI/sandbox dependency — fully client-side
      (static audio files).
- [x] **Spoons energy level** (was the ⭐ "Energy Check-In" idea below, shipped with more
      scope than originally proposed) — a global 0-100 "spoons" picker (button + popup,
      not a tool tile), persisted to `localStorage`, visible on every screen via the same
      always-mounted pattern as `DistractMeProvider`/`NowPlayingBar`. Every AI tool's
      request is automatically wrapped with the current spoon count in `useAiTool.ts`; the
      Lambda unwraps it once and prepends a single shared low/medium/high instruction
      before the tool-specific prompt — so response complexity/sophistication scales with
      energy for every AI tool (present and future) with zero per-tool code. Verified with
      Playwright screenshots (button, popup, live slider updates, persistence across
      navigation) and isolated unit tests of the envelope parsing / bucketing logic.
      Non-AI tools (Pomodoro, Distract Me) just show the level — there's no "response" for
      them to make more/less sophisticated.
- [x] **Call Script** (was the "Script Writer" idea below) — describe what a phone call
      needs to accomplish, pick a tone, optionally say who it's to; get back an
      Opening/Main point/If they ask more/Closing script meant to be read aloud during the
      call. Automatically respects the Spoons energy level via the existing shared
      envelope — no tool-specific work needed. Verified with a Playwright test that mocks
      the AppSync response end-to-end, plus unit tests for the message builder.
- [x] **Is This Mad?** — mirror image of Tone Checker: paste a message *someone else* sent
      *you* (plus optional context) and get a calm, literal read (Tone / Most likely
      meaning / Reassurance / Asks) instead of the worst-case interpretation. Targets
      rejection-sensitive spirals directly — the system prompt explicitly instructs the
      model not to validate a catastrophizing reading even if the given context suggests
      the user is anxious about it. Originally shipped without the "Asks" field; the
      separately-planned **Just The Facts** tool (flat bullet list of the concrete asks
      in a rambling/passive-aggressive message) turned out to be near-identical in
      practice — both take a message from someone else and calm it down — so instead of
      shipping two similar tools, "Asks" was folded into this one's output as a fourth
      field rather than built standalone. Grouped with the other "saying" tools on Home,
      right after Tone Checker. Verified with a Playwright test mocking the AppSync
      response, plus unit tests for the message builder.
- [x] **Real logo + rainbow theme** — replaced the placeholder abstract favicon with the
      user-supplied hand-drawn logo (Home header + favicon/apple-touch-icon), and reworked
      the color theme around six rainbow accent colors sampled from the logo's hammer
      handle (`--rb1`..`--rb6`), used decoratively across tool card badges, the energy
      pill, the now-playing bars, and page-heading dividers. The single grounding action
      color moved from purple to a teal sampled from the logo's wordmark. Verified with
      Playwright screenshots in both themes.
- [x] **Remind Me** — set reminders in plain English ("remind me in 20 mins to have
      lunch", "remind me at 5:30 to go home, warn me 20 mins before"); one-shot or
      repeating (daily / weekdays only / every N minutes or hours),
      with an optional warning fired ahead of the actual reminder. Text entry is the only
      input method — a plain form shipped alongside it initially, then was removed the
      same day for looking visually noisy, since natural language already covers
      everything the form did. Parsing is fully client-side (`src/lib/reminderParser.ts`,
      using `chrono-node`)
      rather than routed through the AI Lambda — deliberately, since this session already
      hit real bugs from LLMs not reliably following an exact output format, and a
      reminder firing at the wrong time is worse than a tool's text looking odd; parsing
      is also fully deterministic and unit-testable this way. Reminders persist across
      navigation *and* full page reloads (`RemindersContext`, `localStorage`-backed) and
      fire regardless of which tool is open, surfaced by `ReminderBanner` mounted
      unconditionally in `App.tsx` — this is the "global alert/notification layer" from
      Infrastructure below, now shipped. Also tries the browser's system Notification API
      best-effort (permission requested on first use) on top of the always-on in-app
      banner. A reminder that was already overdue when the tab was closed fires once as a
      "catch-up" the next time the app opens, rather than being silently lost. Verified
      with unit tests (parser phrase variations, fake-timer tests of warning/due/repeat
      scheduling and the catch-up path) and Playwright driving the real app end-to-end,
      including confirming a reminder fires while a *different* tool is open. The Home
      tile also shows a live active-reminder count badge (`ToolCard`'s new optional
      `badgeCount` prop) so the count is visible without opening the tool. Reminders
      more than an hour away get a 15-minute warning by default unless the user asks for
      a different one; a reminder or requested warning that would land in the past is
      rejected with a specific error instead of silently accepted, and the text stays
      editable so the user can fix and resubmit. The Active Reminders list shows the
      reminder time and (if set) the warning time as two clearly labeled lines rather
      than a vague relative offset. Accepts noticeably more flexible phrasing —
      "in an hour and a half", "in two and a half hours", "a quarter hour", "half past
      five", "quarter to five" — some of which chrono-node silently got wrong until a
      small pre-processing step rewrote them into a form it already handles correctly.
      Example phrases are now shown directly on the tool screen.
- [x] **Usage logging** — a dedicated `log-event` Lambda + `logEvent` mutation
      (separate from `ai-assist`, no Anthropic SDK, own CloudWatch log group) records
      which tools get opened and whether AI-backed calls succeed, wired in at exactly
      two centralized points (`App.tsx`'s tool selection, `useAiTool.ts`'s `run()`) so
      every tool is covered with zero per-tool code. Log detail keeps short field values
      (tone/verbosity/repeat-kind choices) as-is but reduces longer string values to
      just their length, to get real behavioral insight without logging the substance
      of personal content (reminders, messages). See `OPERATE.md`'s "Viewing usage
      logs" for how to actually read it. Non-AI tools (Distract Me, Pomodoro, Remind Me)
      only get an `opened` event for now — see the "Later" section below for
      action-level events on those.
- [x] **User accounts, Phase 1: auth only** — `defineAuth({ loginWith: { email: true }
      })` (Cognito, email+password) behind a new `AccountButton` (top-left, mirrors
      `EnergyButton`), using Amplify UI's `<Authenticator>` retheme to match this app's
      colors rather than hand-built forms. Deliberately auth-only in this pass — no data
      model, nothing gated behind sign-in; `runAiTool`/`logEvent` stay on the public API
      key exactly as before. See "User accounts, Phase 2" below (now also shipped) for
      the real per-user data model. Built and verified on the `feature/user-accounts`
      branch — not yet merged to `main`.
      - Two real Authenticator quirks found while wiring up the theme: the email field's
        `name` attribute is `"username"` on the Sign In tab but `"email"` on the Create
        Account tab (inconsistent between tabs); and the card/tabs background ignores
        the general `--amplify-colors-background-primary` token, needing the more
        specific `--amplify-components-authenticator-router-background-color` (and the
        matching `tabs-*` tokens) to actually follow dark mode.
      - Verified end-to-end against a real personal sandbox (`ampx sandbox --identifier
        authtest`): admin-created a confirmed Cognito test user (`aws cognito-idp
        admin-create-user` + `admin-set-user-password`) to verify sign-in → session
        persists across a reload → sign-out with Playwright, since that doesn't need a
        real inbox; separately drove the real sign-up and forgot-password forms far
        enough to confirm each one successfully reaches Cognito and transitions to its
        "enter the code we emailed you" step (confirmed by the exact heading Cognito
        returns) — completing those two specific steps needs a real email inbox, which
        wasn't available in this pass.
- [x] **User accounts, Phase 2: persist Reminders + Spoons** — gives sign-in an actual
      purpose (previously a no-op). Two owner-scoped `a.model()`s (`Reminder`,
      `UserPreferences`) in `amplify/data/resource.ts`; `RemindersContext`/
      `EnergyContext` reworked to use `observeQuery()` when signed in and stay
      completely unchanged when signed out. Reminders migrate from `localStorage`
      silently on first sign-in (no confirmation prompt, by explicit choice); Spoons
      does the reverse merge (a returning user's backend value wins over a device's
      local one). Built and verified on `feature/user-accounts`, not yet merged to
      `main`. Full writeup: `designs/user-personalization.md`'s "What Phase 2 built".
      - Real bug caught only by checking DynamoDB directly, not the UI: the Data
        client needs an explicit `authMode: 'userPool'` for these owner-scoped models
        (the schema's `defaultAuthorizationMode` is `'apiKey'`, for `runAiTool`/
        `logEvent`) — without it, every write was silently rejected server-side while
        the UI looked completely normal (optimistic state + the `localStorage` mirror
        both masked it). Fixed in `src/lib/dataClient.ts`.
      - Verified end-to-end against the real sandbox: reminder + Spoons changes
        confirmed via direct DynamoDB scans, surviving a real page reload, and a second
        "device" with a pre-existing local reminder merging on sign-in without
        duplicating anything.
      - Second real bug, this one caught by the user's own manual testing rather than
        anything automated: a reminder created while signed in was still fully visible
        after signing out. Account data was leaking into the signed-out `localStorage`
        view. Fixed by never writing to `localStorage` while signed in and reverting to
        pre-sign-in local state on sign-out — see `designs/user-personalization.md` for
        the full story, including a first attempted fix that reintroduced the same bug
        via a race between two effects.

## Later / stretch ideas

- [ ] **How Long Will This Actually Take** — time-blindness estimator: describe a task,
      get a realistic time estimate plus a buffer.
- [ ] **Brain Dump Sorter** — paste a messy stream-of-consciousness dump, get it split into
      Do Now / Someday / Reference / Not Actually Yours to worry about.
- [ ] **Action-level usage events for non-AI tools** — the shipped usage logging (see
      Shipped) only captures "opened" for Distract Me, Pomodoro Timer, and Remind Me,
      since those aren't centralized through `useAiTool` the way AI-backed tools are.
      Worth adding "sound played", "timer completed", "reminder created" events if
      opened-only turns out to be too coarse — would need a small amount of per-tool
      instrumentation rather than the current zero-touch approach.

## Research: new tool ideas (2026-07-07)

Researched what other ADHD/neurodiversity tools and apps (Goblin Tools, Tiimo, Finch,
Habitica, Focusmate, Inflow, DOSE, etc.) focus on, to widen the backlog beyond what was
already there. Grouped by mechanism (AI-backed vs. client-side), with the three most
worth building next marked ⭐. See "Sources" at the bottom of this section.

### ⭐ Top 3 for consideration

1. ⭐ **Shared Task Store** (infrastructure, see below) — the single highest-leverage
   item: every list-producing tool currently throws its output away. This is what makes
   the *other* two picks (and Side Quest Log / Brain Dump Sorter, once built) work
   together instead of as isolated islands.
2. ⭐ **Dopamine Menu** — a short, user-curated, editable list of "quick, easy, low-effort
   things that reliably feel good" (stretch, 2-min tidy, favourite song, text a friend,
   step outside). No AI needed: just add/remove/reorder items in `localStorage`, plus a
   "surprise me" button that picks one at random. Directly targets the ADHD dopamine-deficit
   mechanism that gamified habit apps (Habitica, Finch, KUBBO) exploit with points and
   pets — this is the low-tech, no-manipulation version: a shortcut past decision fatigue
   ("what do I even do right now") straight to something rewarding, instead of a points
   economy. Cheap to build, nothing to click-test against a sandbox (no AI call), and a
   natural thing to surface as a suggestion from other tools (see "Linking tools" below).

~~3. ⭐ **Energy Check-In**~~ — shipped, see "Spoons energy level" under Shipped above (and
   Infrastructure below for what it unlocks next).

### AI-backed ideas (new `SYSTEM_PROMPTS` entry, same pattern as existing tools)

- [ ] **Decision Helper** — describe 2-4 options you're stuck choosing between (what to
      eat, which task to start, which email to send first) and get one nudged-towards
      recommendation with a one-line reason, not a pros/cons essay. Mirrors Goblin Tools'
      "Consultant." Targets choice paralysis / decision fatigue specifically, which shows
      up constantly for ADHD adults in small everyday choices, not just big ones.
~~- [ ] **Script Writer**~~ — shipped as **Call Script**, see Shipped below.
- [ ] **Explain It Simply** — paste a confusing instruction, form, or piece of jargon
      (insurance letter, tax form line, recipe step) and get it explained in plain,
      literal language. Mirrors Goblin Tools' "Professor."
- [ ] **Meltdown/Shutdown Debrief** — after an overwhelm episode has passed, paste a rough
      description of what happened and get back a calm, non-judgmental, factual recap
      (what likely triggered it, what helped, one small thing to try next time) — explicitly
      not therapy, just an externalized, unemotional record so the pattern is visible over
      time instead of each episode feeling isolated and shameful. Pairs naturally with a
      client-side Sensory Reset tool (below) as the "during" companion to this tool's
      "after."

### Client-side ideas (no AI, `localStorage`-backed)

- [ ] **Dopamine Menu** — see ⭐ above.
- [ ] **Sensory Reset** — a single calm full-screen "during an overwhelm moment" tool: a
      slow breathing pacer animation, a 5-4-3-2-1 grounding script, and a couple of
      one-line reminders (cold water, step outside, noise-cancelling on). No input, no
      output, no AI — just a thing to open and follow along with for 90 seconds.
- [ ] **Decision Roulette** — for small, low-stakes, *recurring* choices (what's for
      dinner tonight, which show to watch), let the user save a short personal shortlist
      once, then "spin" to pick one at random from it. Different from the AI Decision
      Helper above: this is for choices where any option is fine and the only problem is
      picking one, not choices that need judgement.
- [ ] **Time-Made-Visible widget** — a reusable shrinking-ring/bar countdown component
      (green → yellow → red as time runs out) rather than a plain numeric timer. Pomodoro
      already grew a "visualise remaining time" toggle in this spirit — worth pulling the
      shrinking-time visual into its own shared component so future timer-ish tools
      (Transition Warning, a body-double focus session) can reuse it instead of
      reimplementing.
- ~~**Transition Warning**~~ — largely covered by **Remind Me**'s shipped warn-before
      feature (see Shipped): a one-shot reminder with a "warn me N minutes before" offset
      *is* a heads-up alarm before a hard stop, firing reliably regardless of which tool
      is open via the global alert layer. A dedicated tile isn't needed unless a more
      specific UX (e.g. a "before I leave" preset) turns out to be worth it later.
- [ ] **Streak-free habit tracker** — a small number of user-defined daily habits with a
      simple check-off and a running streak count. Deliberately *not* full RPG
      gamification (points/pets/loot) — that's a specific design choice worth revisiting
      only if simple streaks turn out not to be motivating enough; several ADHD apps
      (Habitica, Finch) lean hard into game mechanics and it's worth watching whether that
      helps or becomes its own distraction before committing this app's tone to it.

### Deliberately not building (noted so it isn't re-researched later)

- **Virtual body doubling / co-working matching** (Focusmate-style) — needs real-time
  matching and video infrastructure, a different order of complexity than anything else
  in this app. If this is wanted, link out to an existing service (Focusmate, Flow Club)
  rather than rebuild it.
- **RSD episode tracker** (DOSE-style) — closer to a mental-health tracking tool than a
  quick-use utility; also the space where "not therapy, just a nudge" framing gets
  trickiest to get right. Worth a deliberate design conversation rather than adding as a
  routine new-tool-folder exercise.

### Linking tools together

Concrete connections worth wiring up as tools accumulate, once the Shared Task Store
(below) exists:

- **Task Breakdown → Shared Task Store**: each generated step gets a one-click "Send to
  Tasks" instead of living only in the tool's own output pane.
- **Brain Dump Sorter → Shared Task Store**: the "Do Now" bucket specifically lands in the
  same store as Task Breakdown's steps — they're the same kind of thing, just produced by
  different entry points.
- **Is This Mad? → Shared Task Store**: the "Asks" field's extracted bullet list of "what
  they're actually asking you to do" is also just tasks.
- **Side Quest Log → Shared Task Store**: triaging an entry to "do it" promotes it into
  the same store rather than the log being a dead end.
- **Is This Mad? → Reply Starter**: after getting a calm read on an incoming message, a
  "draft a reply" button hands the original message straight to Reply Starter instead of
  requiring a copy-paste round trip.
- ~~**Energy Check-In → Task Breakdown**~~ — done, and generalized to every AI tool rather
  than just this one (see "Spoons energy level" under Shipped).
- **Spoons → Shared Task Store**: filter/sort the store by what fits the current energy
  level rather than showing everything at once.
- **Dopamine Menu ↔ Pomodoro**: surface a "pick something from your Dopamine Menu" prompt
  on Pomodoro breaks, instead of the break just being empty time.
- **Sensory Reset ↔ Meltdown/Shutdown Debrief**: Sensory Reset is the in-the-moment tool;
  the Debrief is the same episode's after-the-fact reflection. Worth a shared entry point
  ("that's over now" button inside Sensory Reset that offers to open the Debrief).

### Sources

- [Goblin Tools](https://goblin.tools/) — Magic Todo, Formalizer, Judge, Estimator,
  Compiler, Chef, Professor, Consultant. Closest existing analogue to this app's own tool
  set and a good reference for scope-per-tool.
- [Tiimo](https://www.tiimoapp.com/resource-hub/adhd-time-agnosia-strategies) — visual/
  icon-based timelines and countdown timers for time blindness.
- [Focusmate](https://www.focusmate.com/) / [Flow Club](https://www.flow.club/) — virtual
  body doubling, referenced under "deliberately not building."
- [DOSE RSD Meter](https://www.getdose.app/rsd.html) — dedicated rejection-sensitive-
  dysphoria tracking, referenced under "deliberately not building."
- [Habitica](https://habitica.com/) / Finch / KUBBO — RPG-style gamified habit tracking,
  referenced as the "full gamification" alternative the streak tracker deliberately avoids
  for now.
- ADDitude Magazine — [punctuality & time blindness](https://www.additudemag.com/punctuality-time-blindness-adhd-apps-tips/).
- Neurodivergent Insights — [rejection sensitive dysphoria](https://neurodivergentinsights.com/rejection-sensitive-dysphoria/).

## Infrastructure

- [ ] ⭐ **Shared Task Store (the "spine")** — a single canonical list of tasks/items,
      exposed as a `TaskStoreContext` the same way `DistractMeContext` exposes audio
      state, backed by `localStorage` first and an Amplify `a.model('Task')` later once
      auth lands. This is what turns the app from "a grid of unrelated tools" into a
      system — see "Linking tools together" above for the specific connections it
      unlocks. Worth building as soon as a second list-producing tool ships (Brain Dump
      Sorter or Side Quest Log), since retrofitting it after three tools have grown their
      own bespoke list UIs is more work than building it first.
- ~~**Global alert/notification layer**~~ — shipped as part of **Remind Me** (see
      Shipped): `RemindersContext` (same pattern as `DistractMeContext`) owns the
      timers/alarms and keeps them firing regardless of which tool is open, surfaced via
      `ReminderBanner` mounted unconditionally in `App.tsx`. Any future timer-based tool
      (e.g. a body-double focus session) can reuse `useReminders()` instead of solving
      "what if the user left the page" from scratch. Pomodoro's own countdown still
      doesn't survive navigating away — it wasn't migrated onto this layer, since its
      short, actively-watched countdown is a different use case from a fire-and-forget
      reminder; revisit only if that turns out to matter in practice.
- [x] **User accounts, Phase 1: auth only** (see Shipped) — `amplify/auth/resource.ts`
      (email/password Cognito auth) + a themed Amplify UI `<Authenticator>` behind a new
      `AccountButton`, sign-up/sign-in/sign-out/password-reset all working. Built and
      verified on the `feature/user-accounts` branch, not yet merged to `main`.
      Deliberately stops here — no data model changes yet, nothing gated behind
      sign-in — see below for what's still open.
- [x] **User accounts, Phase 2: a persistent Data model** (see Shipped above) —
      `Reminder` and `UserPreferences` (Spoons) now persist per signed-in user via
      owner-scoped `a.model()`s, reworking `RemindersContext`/`EnergyContext` from
      synchronous `localStorage` reads/writes to `observeQuery()`-driven backend state
      when signed in. Auth remains opt-in, not a login wall — `localStorage` stays the
      default for anyone not signed in. Everything else that could still move to a
      per-user model (Side Quest Log entries, Pomodoro settings/streaks, saved
      messages, the Shared Task Store above, Distract Me's last sound/volume) is
      unstarted — see "Phase 3+" in `designs/user-personalization.md`.
