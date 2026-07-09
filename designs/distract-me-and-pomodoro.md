# Distract Me & Pomodoro Timer — Design Document

**Status:** Both shipped on `main`. Pomodoro Timer + "visualise remaining time":
2026-07-06. White Noise → Distract Me rename + Pink Noise: 2026-07-07.

## Motivation

The two tools in the app that need no AI at all — pure client-side state, no Lambda call,
no network dependency to function. Grouped together in this document because they're the
origin of the persistent-provider pattern (`designs/architecture-overview.md`) and share
a "this needs to keep running when you're not looking at it" requirement, even though
their actual purposes are unrelated (ambient sound vs. a countdown).

## Distract Me

**Problem:** background sound to help with focus (masking distracting silence/noise) or
to tune out an overstimulating environment — two different reasons for the same
mechanism. **Requirement that shaped the architecture:** the sound must keep playing
when the user switches to another tool — an ambient-noise tool that stops the moment you
navigate away from it is close to useless.

**Design:** the actual `<audio>` element and playback state live in `DistractMeContext`
(`src/context/DistractMeContext.tsx`), mounted once at the app root, not inside the
tool's own component — this is the pattern's origin case. The tool's own page
(`src/tools/distractMe/`) is just one consumer that can start/stop/pick a sound;
`NowPlayingBar` (rendered unconditionally in `App.tsx`) is a second, independent
consumer showing what's currently playing with volume control, visible regardless of
which tool is on screen. One sound at a time for v1 — layering multiple sounds was
considered and deliberately deferred as an unnecessary complexity for a first version.

**Sounds:** Rain, Sea, Cafe, and Pink Noise (added 2026-07-07, alongside renaming the
tool from "White Noise Widget" to "Distract Me" — the rename reflects that masking
*and* tuning-out are both legitimate reasons to use it, not just literal white noise).
Audio files redistributed from Moodist (MIT-licensed), sourced from Pixabay Content
License / CC0 — see `README.md`'s Assets section for the full attribution chain.

## Pomodoro Timer

**Problem:** a standard focus-timer need, with one ADHD-specific addition: a numeric
countdown alone doesn't always convey "how much time is actually left" in a way that's
easy to feel/glance at, especially under time blindness.

**Design:** 5/10/15 minute presets, stop/resume, reset, a tomato graphic that pulses
while running. The **"Visualise remaining time" toggle** (added same day) changes the
tomato's *behavior*, not just its look: instead of pulsing in place, it shrinks in
proportion to time remaining, then pops (sound + animation) at zero — a physical,
at-a-glance answer to "how much is left," as an alternative to reading the numbers. Fully
client-side, no AI/sandbox dependency.

### The pop-sound-plays-twice bug (the lesson that got reapplied twice more)

A real bug, not hypothetical: the completion side effects (`setStatus('done')`, playing
the pop sound) originally lived *inside* the `setRemainingSeconds` state updater
function. React — specifically Strict Mode, in development — may invoke a functional
state updater more than once to help surface exactly this class of impurity. The
sound played twice as a result.

**Fix:** move the side effects out of the updater entirely — compute the new state as a
plain value first, then trigger side effects afterward, outside any `setState` callback.

**Why this is in a design doc and not just a changelog line:** this exact shape of bug —
an impure `setState` updater with a side effect inside it — recurred twice more later in
the project, and the fix pattern from here is what resolved both:
- `RemindersContext`'s `checkReminders()` (see `designs/remind-me.md`) was written from
  the start to compute the new reminders array and any newly-fired events as plain
  values *before* calling `setReminders`/`setFiredEvents`, specifically to avoid
  reintroducing this bug in a function that also has real side effects (browser
  notifications, banner events) riding along with a state update.
- The regression test for this bug (`src/tools/pomodoroTimer/index.test.tsx`, using fake
  timers) is the project's reference example for testing timer-driven side effects —
  cited directly in `OPERATE.md`'s testing section for anyone adding a similar tool.

## Testing approach

Both are tested with Testing Library + Vitest fake timers rather than real waits —
`vi.advanceTimersByTimeAsync()` to drive a countdown to completion in milliseconds of
real test time, with `HTMLMediaElement.prototype.play` mocked (jsdom can't actually play
audio) so assertions can check *how many times* and *with what source* playback was
attempted, which is exactly the shape of assertion that catches the double-pop bug
above.
