# Tool ideas backlog

Ideas for new tools, roughly in build order. See README.md "Adding a new tool" for the
mechanics — most of these are just a new system prompt away.

## Up next

- [ ] **Side Quest Log** — a one-line quick-capture parking lot for stray thoughts that
      pull your attention mid-task. Add a line, keep working, come back to a running list
      later to triage (do it / bin it / turn it into a real task). No AI needed — pure
      client-side tool backed by `localStorage`, first tool in the app that isn't
      AI-backed. Good proof that the framework isn't AI-only.
- [ ] **Is This Mad?** — paste a message *someone else* sent *you*; get a calm, literal
      read on their tone instead of the worst-case interpretation. Mirror image of the
      existing Tone Checker (which checks messages *you're* about to send). Targets
      rejection-sensitive spirals directly.
- [ ] **Just The Facts** — paste a rambling, emotionally loaded, or passive-aggressive
      message/instruction from someone else; get back a flat, unemotional bullet list of
      what they're actually asking you to do. Complements Task Breakdown (which takes a
      task *you* already know about, this takes someone else's words and extracts the ask).

## Shipped

- [x] **Reply Starter** — stuck on a message you owe a reply to; get 3 short, low-effort
      draft replies (with a one-click copy button) to break initiation paralysis. Now also
      has Tone / Length / optional intent controls.
- [x] **Pomodoro Timer** — 5/10/15 min presets, stop/resume, reset, pulsing tomato graphic
      while running. Committed but not yet click-tested against a live sandbox.
- [x] **Tone Checker context field** — optional "Context" box (who it's to / what's going
      on) to sharpen the read, phrased low-pressure and factual on purpose.
- [x] **White Noise Widget** — Rain / Sea / Cafe loops, persistent across tool navigation
      via a `WhiteNoiseProvider` at the app root + a global mini-player. One sound at a
      time for v1; layering multiple sounds is a possible later enhancement. Not yet
      click-tested against a live sandbox.

## Later / stretch ideas

- [ ] **How Long Will This Actually Take** — time-blindness estimator: describe a task,
      get a realistic time estimate plus a buffer.
- [ ] **Brain Dump Sorter** — paste a messy stream-of-consciousness dump, get it split into
      Do Now / Someday / Reference / Not Actually Yours to worry about.

## Infrastructure

- [ ] **User accounts (Amplify Auth) + persistent Data model** — lets tools that need to
      remember state (Side Quest Log entries, Pomodoro settings/streaks, saved messages,
      etc.) store it in a real database per signed-in user instead of `localStorage`,
      syncing across devices. Needs: `amplify/auth/resource.ts` (Amplify Auth — email/
      password to start), one or more `a.model(...)` entries in `amplify/data/resource.ts`
      scoped to the owner, and a sign-in gate in the frontend (Amplify's `Authenticator`
      component is the fast path). Bigger lift than a normal tool — touches auth, data
      modeling, and the app shell, not just a new tool folder. Worth doing once there's
      more than one tool that wants persistent state, not before.
