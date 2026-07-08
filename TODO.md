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

## Later / stretch ideas

- [ ] **How Long Will This Actually Take** — time-blindness estimator: describe a task,
      get a realistic time estimate plus a buffer.
- [ ] **Brain Dump Sorter** — paste a messy stream-of-consciousness dump, get it split into
      Do Now / Someday / Reference / Not Actually Yours to worry about.

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
- [ ] **Transition Warning** — set a "heads up" alarm some number of minutes before a hard
      stop (leaving for an appointment, end of a work block) so a transition doesn't
      arrive with zero warning. Needs the global alert layer (below) to fire reliably even
      if you've navigated away from the tool that set it.
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
- [ ] **Global alert/notification layer** — a `NotificationContext` (same pattern as
      `DistractMeContext`) that owns timers/alarms so they keep firing even if the user
      has navigated away from the tool that started them. Needed by: Pomodoro (check
      whether its alarm currently survives navigating away — if not, this is why), any
      future Transition Warning tool, and any future medication/routine reminders.
      Without this, every timer-based tool has to solve "what if the user left the page"
      from scratch.
- [ ] **User accounts (Amplify Auth) + persistent Data model** — lets tools that need to
      remember state (Side Quest Log entries, Pomodoro settings/streaks, saved messages,
      the Shared Task Store above, etc.) store it in a real database per signed-in user
      instead of `localStorage`, syncing across devices. Needs: `amplify/auth/resource.ts`
      (Amplify Auth — email/password to start), one or more `a.model(...)` entries in
      `amplify/data/resource.ts` scoped to the owner, and a sign-in gate in the frontend
      (Amplify's `Authenticator` component is the fast path). Bigger lift than a normal
      tool — touches auth, data modeling, and the app shell, not just a new tool folder.
      Worth doing once there's more than one tool that wants persistent state, not before
      — the Shared Task Store above and the shipped Spoons energy level can both stay
      (or start) `localStorage`-only and migrate onto this later without changing their
      calling API.
