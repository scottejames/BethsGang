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
- [x] **Park My Sidequest** — a simple task manager: Projects (optional grouping) and
      Tasks (title, a Small/Large size, and a Now / Later / Not Your Problem category),
      built on top of a new shared `TaskStoreContext` — see "Shared Task Store" under
      Infrastructure below, this is its first consumer. Initially shipped wired into no
      existing tool (see below for that changing). A project can be deleted without
      losing its tasks — they're detached (project-less) rather than destroyed.
      Completed tasks stay visible (struck through, sunk to the bottom) rather than
      disappearing. `localStorage`-backed only, no backend model this pass. Covered by
      unit tests (`TaskStoreContext.test.tsx`, `parkMySidequest/index.test.tsx`) and
      verified with Playwright against the real running app.
      - **UI rewritten as a project/task tree** shortly after first shipping, on direct
        feedback that the original filter-chip layout didn't tie projects to tasks
        closely enough. Each project (plus a synthetic "Unfiled" bucket for standalone
        tasks) is now a collapsible section with its own scoped add-task row and task
        list; category became a per-task colored tag instead of a top-level grouping.
        `TaskStoreContext` itself didn't need to change — see `CHANGELOG.md`'s "Changed"
        entry for the full story.
      - **Full edit lifecycle added** for both Projects (rename) and Tasks (title,
        size, and moving a task between projects/Unfiled) — a gap found by explicitly
        auditing CRUD completeness across the whole widget rather than just adding the
        one thing asked for. Category and done-status were already editable at any
        time; title/size/project were frozen at creation until this pass. See
        `CHANGELOG.md`'s "Added" entry for the full story.
      - **Wired to Task Breakdown, bidirectionally** — a 🧩 button on any project sends
        it to Task Breakdown (pre-filled with the project name); Task Breakdown gets a
        matching "send back" button that's smart about where the steps land: back into
        the *same* project if that's where the session started, or a brand-new project
        (named after the task) if Task Breakdown was opened standalone. Required a new
        `ToolNavigationContext` (promoting `activeToolId` out of `App.tsx`'s local state
        into a proper Context) so one tool can navigate to another at all — the actual
        prerequisite for every other link in "Linking tools together" below, not just
        this one. See `CHANGELOG.md`'s "Added" entry for the full design.
- [x] **Dopamine Menu** — a short, user-curated, editable list of "quick, easy,
      low-effort things that reliably feel good" (stretch, step outside, a favourite
      song, text a friend, a hot drink), plus a "🎲 Surprise me" button that reveals one
      at random, avoiding an immediate repeat when another item exists. `localStorage`-
      backed only — no AI, and (deliberately, for now) no shared Context, since nothing
      else reads this list yet; the first tool to persist its own state directly rather
      than through a root-mounted provider. Seeded with 8 default items only the very
      first time the app ever runs; a deliberately emptied list stays empty rather than
      being silently reseeded. Covered by unit tests (seeding, add/delete/reorder, the
      no-repeat reveal logic) and verified against the real running app with
      Playwright in both themes. `TODO.md`'s "Dopamine Menu ↔ Pomodoro" link (below)
      is still unstarted.

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
~~2. ⭐ **Dopamine Menu**~~ — shipped, see Shipped below.

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

~~**Dopamine Menu**~~ — shipped, see Shipped above (⭐ pick above).
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

Concrete connections worth wiring up as tools accumulate. The Shared Task Store (below)
now exists, shipped via Park My Sidequest — none of the connections below are wired up
yet, by explicit choice, but the store itself is no longer the blocker:

- ~~**Task Breakdown ↔ Shared Task Store**~~ — done, and bidirectional (see Shipped):
  a project can be sent to Task Breakdown and its steps sent back, either into that
  same project or a new one depending on where the session started.
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

## Research: broadening beyond ADHD (2026-07-09)

The app's own README still describes it as "for people with ADHD," and every shipped tool so
far targets ADHD-specific friction (initiation paralysis, time blindness, RSD, decision
fatigue). Researched what autistic, dyslexic/dyspraxic, PDA, and alexithymic adults
specifically struggle with that ADHD-focused tools don't cover, to widen who "neurodiverse"
means in this app's own framing. Grouped the same way as the 2026-07-07 research above,
with the three most worth building next marked ⭐. Sources at the bottom.

### ⭐ Top 3 for consideration

1. ⭐ **Low-Demand Mode** (infrastructure/global setting, mirrors Spoons) — a single toggle
   that rewrites every AI tool's phrasing from imperative to declarative/optional language
   ("the dishes are still in the sink" vs. "do the dishes"; "here's an option" vs. "you
   should"), plus softens the app's own copy ("Add a task" → "there's a task here if you
   want it"). Grounded in PDA (Pathological Demand Avoidance) research: demands — even
   self-imposed ones from a to-do app — can trigger a genuine anxiety/avoidance response,
   and the standard advice is declarative language and framing tasks as choices, not
   commands. This app's existing tools (Park My Sidequest, Remind Me, Call Script) are all
   phrased as commands and due dates by default, which is exactly the pattern PDA guidance
   says to avoid. Same shape as Spoons: one context, one `parseEnvelope`-style instruction
   prepended in the Lambda, zero per-tool code, and it would improve the app for anyone who
   finds command-toned software stressful, not only diagnosed PDA users.
2. ⭐ **Reading Accessibility Mode** (infrastructure/global setting, no AI) — a
   dyslexia/dyspraxia-friendly display toggle: dyslexia-friendly font (e.g. OpenDyslexic or
   a similar licensed alternative), wider line/letter spacing, and a "read this aloud"
   button on any tool's output using the browser's built-in `SpeechSynthesis` API — no new
   dependency needed. Every dyslexia-tool source surveyed converges on the same two
   primitives (text-to-speech + a dyslexia-friendly font/spacing option) as the highest-
   value, lowest-effort accommodation. Same infra shape as Spoons/Energy — a context +
   button rendered once at the app root, and every existing and future tool's text output
   benefits for free, with zero per-tool work.
3. ⭐ **In-the-Moment Phrase Board** — a grid of short, user-editable phrases ("I need a
   break," "too loud in here," "give me a minute," "I can't talk right now," "can you write
   it down instead?") that speak aloud (`SpeechSynthesis`) or display large on tap. Distinct
   from Reply Starter/Call Script, which are for async written replies you have time to
   draft — this is for real-time, in-person moments (shutdown, situational mutism, sensory
   overload) where typing a prompt into an AI tool isn't an option. No AI needed; same
   editable-list-plus-`localStorage` shape as the already-planned Dopamine Menu, so it's
   cheap to build once that pattern exists.

### AI-backed ideas (new `SYSTEM_PROMPTS` entry, same pattern as existing tools)

- [ ] **Accommodation Request Drafter** — describe the situation informally ("open-plan
      office is too loud and I can't concentrate") and get back a short, professional
      email/script requesting the accommodation, in the register HR/a manager expects.
      Same shape as Call Script; sources below have concrete phrasing conventions (state
      the need, cite a specific ask, offer to discuss) worth encoding in the system prompt.
      Automatically respects Spoons and (if built) Low-Demand Mode.
- [ ] **Subtext Decoder** — generalizes *Is This Mad?* beyond anger/anxiety specifically:
      paste an indirect or high-context message ("the trash is getting pretty full") and get
      back the literal content plus what's actually being asked, for anyone whose default
      reading is literal rather than inferential. Grounded in the "double empathy problem"
      research: autistic/neurotypical miscommunication is framed as a translation gap
      between a low-context and a high-context communication style, not a one-sided deficit
      — this tool is the low-context→literal direction; Reply Starter/Call Script already
      cover the reverse (literal intent → socially-expected phrasing).
- [ ] **Feelings Finder** — describe physical sensations ("tight chest, jaw clenched, can't
      sit still") instead of an emotion name, and get back a short list of candidate
      emotion words plus a validating, non-diagnostic note. Targets alexithymia (present in
      an estimated 40-65% of autistic adults, and under-researched but present in ADHD too)
      — the mechanism is that interoceptive signals arrive without a clear emotion label
      attached, so naming the sensation instead of the feeling is the accessible entry
      point. Explicitly not a diagnostic or therapy tool, same framing discipline as
      Meltdown/Shutdown Debrief.

### Client-side ideas (no AI, `localStorage`-backed)

- [ ] **Sensory Environment Log** — extends the already-planned Meltdown/Shutdown Debrief
      with an optional structured field for *where* and *what sensory conditions* (noise,
      light, crowd, smell) preceded an overwhelm episode, building a personal "places/
      situations that reliably overwhelm me" list over time — a private, personal version
      of what crowdsourced noise-level apps (SoundPrint) do publicly per-venue.
- [ ] **Visual Day Plan** — an icon-based timeline of the day (not just a countdown), built
      on the existing Shared Task Store + Reminders infrastructure rather than a new data
      model. Addresses predictability/transition needs, which show up in autism research as
      a distinct driver from ADHD's time-blindness (the same visual-timeline tools like
      Tiimo already cited in the 2026-07-07 research serve both audiences, but for a
      different underlying reason) — worth being explicit that this isn't just "another
      ADHD timer."

### Deliberately not building (noted so it isn't re-researched later)

- **Real-time AAC (augmentative/alternative communication) replacement** — full picture-
  based/eye-gaze communication devices for nonverbal or minimally-verbal users are a
  regulated assistive-technology category with real safety stakes if a translation is
  wrong; In-the-Moment Phrase Board above is a lightweight, low-stakes cousin (a personal
  phrase shortcut list), not a substitute for a real AAC device.
- **Crowdsourced venue noise/sensory database (SoundPrint-style)** — needs a critical mass
  of other users submitting data to be useful at all, a different problem shape than every
  other tool in this app, which works for a single user on day one. Sensory Environment Log
  above is the personal-only version of the same idea.

### Sources

- [Tonen](https://usetonen.com/blog/best-apps-for-autistic-adults-2026) / [SpecialBridge](https://www.specialbridge.com/apps-for-autistic-adults/) — surveys of current autistic-adult apps (social script rehearsal, grounding/calm kits, SoundPrint, Daylio, Wysa).
- [Tiimo — autistic masking and unmasking](https://www.tiimoapp.com/resource-hub/why-autistic-people-mask).
- [PDA North America](https://pdanorthamerica.org/) and [Defining & Supporting PDA (PDF)](https://pdanorthamerica.org/wp-content/uploads/2025/01/Defining-and-supporting-PDA.pdf) — demand-avoidance mechanism and recovery strategies (reduce pressure, increase autonomy, low-demand environments).
- [Gentle Ally — declarative language examples](https://www.gentleally.com/blog/declarative-language-examples.html) and [Neurodivergent Insights — low-demand parenting](https://neurodivergentinsights.com/low-demand-parenting/) — concrete declarative/low-demand phrasing patterns.
- [Wikipedia — double empathy problem](https://en.wikipedia.org/wiki/Double_empathy_problem) and [Neurodivergent Insights — the double empathy problem](https://neurodivergentinsights.com/the-double-empathy-problem/).
- [Sagebrush Counseling — what is alexithymia](https://www.sagebrushcounseling.com/blog/what-is-alexithymia) and [Autism & ADHD Advocates — interoception & alexithymia](https://www.autismadhdadvocates.org/blogs/interoception-and-interoception-and-alexithymia) — prevalence and the sensation-before-label mechanism.
- [Everway/Texthelp — Read&Write for Work](https://www.everway.com/products/read-and-write-workplace/) and [Helperbird](https://www.helperbird.com/) — text-to-speech + dyslexia-friendly font/spacing as the core accommodation pattern.
- [sensoryoverload.info — workplace accommodation scripts](https://sensoryoverload.info/autism/how-to-request-workplace-accommodations-for-autism-email-templates-meeting-script/) and [Resilient Mind Counseling — neurodiversity workplace accommodations](https://resilientmindcounseling.com/neurodiversity-workplace-accommodations/) — concrete accommodation-request phrasing.

## Infrastructure

- [x] ⭐ **Shared Task Store (the "spine")** (see Shipped — **Park My Sidequest**) — a
      single canonical list of tasks, exposed as `TaskStoreContext` the same way
      `DistractMeContext` exposes audio state, `localStorage`-backed for now (an Amplify
      `a.model('Task')` once signed in is a natural later phase, same path
      Reminders/Spoons already took — not done yet). Shipped with Projects as a grouping
      layer on top (not originally scoped here) and its first consumer, **Park My
      Sidequest**. First tool-to-tool wiring now shipped too (Task Breakdown, see
      Shipped above) — the rest of "Linking tools together" above is still unstarted,
      but the store and the navigation mechanism it needed are no longer the blocker.
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
      per-user model (the Shared Task Store's `Task`/`Project` data below, Pomodoro
      settings/streaks, saved messages, Distract Me's last sound/volume) is
      unstarted — see "Phase 3+" in `designs/user-personalization.md`.
