# Remind Me — Design Document

**Status:** Shipped on `main`, 2026-07-08. The most-iterated-on feature in the project —
built, then corrected four separate times in the same day based on real usage and
explicit feedback. This document exists specifically to preserve *why* each correction
happened, since the surface behavior changed several times and the reasoning is easy to
lose.

## Motivation

Set reminders in plain English ("remind me in 20 mins to have lunch"), with an optional
early warning ("warn me 20 mins before"), one-shot or repeating, that fire regardless of
which tool is open and survive closing the tab. This is also the feature that shipped the
"global alert/notification layer" that had been sitting in `TODO.md`'s Infrastructure
section since early in the project — Reminders didn't just need a tool, it needed
`RemindersContext`, and building it retired that backlog item.

## Key decision: deterministic parsing, not the AI Lambda

Every other tool in the app routes through the shared `runAiTool` Lambda (see
`designs/architecture-overview.md`). Reminders explicitly does not, and this was a
deliberate architectural fork, confirmed with the user before building:

- **The reasoning:** a reminder firing at the wrong wall-clock time is a *worse* failure
  than a tool's text output looking odd — and this project had already hit a real,
  user-reported production bug (see `designs/ai-assist-tools.md`'s format-guard
  incident) from an LLM not reliably following an exact output format. Date/time math
  specifically is a known LLM weak spot. Parsing is also fully deterministic and
  unit-testable this way, in a way "ask the model and hope" never can be.
- **The mechanism:** `src/lib/reminderParser.ts`, using the `chrono-node` library
  entirely client-side. No network round-trip, no API cost, no dependency on the backend
  being reachable to know when something should fire.
- This choice is recorded as a standing project preference (see the auto-memory file
  `feedback_deterministic_over_ai.md`): for any future feature where correctness matters
  more than flexible/creative output, default to a deterministic local approach and
  reach for the AI Lambda pattern only when the task genuinely needs generation, not
  just because it's the app's convention.

## The grammar: what changed and why

**Original shape (as first specified):** two possible leading verbs — "remind me ..." or
"warn me AT <time> ... give me a warning N mins before hand." This actively confused
users: "warn me AT 5:30" reads as if the *warning* fires at 5:30, when actually the
*reminder* does (the warning fires N minutes earlier). Reported back directly: "you seem
to have got the language in remind me a bit confused."

**Corrected shape:** one consistent grammar — `remind me (at|in|before) <time> [to
<message>][, warn me <n> minutes before]`. "Remind me" is always the leading verb; "warn
me ... before" only ever appears as a trailing clause. The old dual-entry-point form was
removed outright, not just deprecated — `LEADING_PREFIX` in `reminderParser.ts` now only
matches `remind me`.

**A real bug this surfaced:** chrono-node absorbs "at"/"in" into its own matched time
phrase ("at 5:30", "in 20 mins"), but not "before" used the same way — "remind me before
5:30 to go home" left a dangling "before" stuck in the parsed message ("before to go
home"). Fixed by explicitly stripping a leading "before"/"by" preposition when it
directly precedes the matched time phrase (`LEADING_TIME_PREPOSITION` in
`reminderParser.ts`). The same mechanism later caught an equivalent gap for "at
noon"/"at midnight" (chrono's match for those keyword times doesn't include the leading
"at" the way it does for numeric times).

## The ambiguous-hour bug (and its edge case)

chrono-node defaults an hour given without am/pm to AM, then pushes to the next day once
that's passed — so "at 5:30" asked at 2pm resolves to 5:30am *tomorrow*, not 5:30pm
*today*. For a casual reminder, the soonest future occurrence of that clock time (either
meridiem) is almost always what's meant.

**Fix:** `resolveAmbiguousHour()` computes both the AM and PM candidate times and picks
whichever is sooner — but *only* when there's no explicit date/weekday/meridiem in the
phrase (an explicit "tomorrow at 9" or "next Tuesday at 5:30" is far less ambiguous, so
chrono's own resolution is left alone there).

**The hour-12 edge case:** found while adding "quarter to one" support (see "Flexible
phrasing" below) — hour 12 wasn't covered by the original 1–11 range check, so "12:45"
asked at 2pm defaulted to 12:45pm *tomorrow* instead of the soonest occurrence (00:45
that night). Fixed by extending the resolver to treat 12 as ambiguous between 00:xx and
12:xx — with a specific carve-out for the literal words "noon"/"midday"/"midnight",
which report the same "meridiem uncertain" flag internally but are never actually
ambiguous as *words* (`UNAMBIGUOUS_HOUR_KEYWORDS` skips the resolver for those).

## Auto-warning default and past-time validation

Two related corrections, both from direct feedback in the same conversation:

1. **"any reminders over an hour set a warning 15 mins before... if the user does not
   explicitly request a [warning]"** — implemented directly in `parseReminderText`
   (not the UI layer), so the live preview always reflects exactly what will be created.
   Only applies when `warnBeforeMinutes` is still `undefined` after parsing (an explicit
   request, including an explicit `0`, is always honored over the default).
2. **"If a user requests a warning or a reminder in the past this should be flagged as
   an error and the reminder not accepted... ability to edit the reminder request."**
   Two distinct validations, both returning the same `{ ok: false, reason }` shape the
   parser already used for "couldn't understand this" — which meant the existing UI
   handled both for free: the reason shows inline, the submit button disables, and the
   original text stays in the field exactly as typed (never cleared on failure), so the
   user can edit and resubmit rather than starting over.
   - The reminder's own time already passed (e.g. an explicit past date — chrono's
     `forwardDate` option only resolves *ambiguous* times forward, it doesn't override
     an unambiguous past one, e.g. "January 1 2020").
   - The reminder is valid but the requested warning offset would itself land in the
     past (e.g. "remind me in 1 min to have lunch, warn me 5 mins before").

## Flexible phrasing (finding real chrono-node bugs, not just gaps)

Requested: "remind me in an hour and a half to eat food" should work, plus "consider what
other syntax you can receive to keep things simple BUT be really flexible." Testing this
against chrono-node directly (before writing any fix) found it wasn't just *unsupported*
phrasing in some cases — it was **silently wrong**:

- `"two and a half hours"` / `"one and a half hours"` resolved to exactly **30
  minutes** — chrono matched only the trailing "half hours" and dropped the leading
  number entirely.
- `"quarter of an hour"` / `"a quarter hour"` resolved to **60 minutes**, or in one
  phrasing, was read as a quarter of a *year*.
- `"half past five"` / `"quarter past five"` / `"quarter to five"` weren't recognised at
  all (empty parse result).

**Fix:** `normalizeDurationPhrases()` rewrites these into forms chrono already handles
correctly (`"1.5 hours"`, `"15 minutes"`, `"5:30"`) *before* chrono ever sees the text,
confined strictly to the matched substring so it can't shift the meaning of surrounding
text. Number words one–twelve are supported alongside digits. This is also where the
hour-12 edge case above was found, since "quarter to one" naturally produces it.

Example phrases are now shown directly on the tool screen (a static list above the input)
so this range of accepted phrasing is discoverable without trial and error — added
alongside the flexibility work itself, not as an afterthought.

**Deliberately not supported:** vague duration idioms with no canonical value ("in a
bit," "shortly," "soon") — these fail gracefully with the existing "couldn't work out
when" error rather than guessing an arbitrary specific duration for genuinely vague
language.

## Architecture: `RemindersContext` and `AlertBanner`

Follows the persistent-provider pattern (`designs/architecture-overview.md`), extended
in two ways nothing before it needed:

- **Must survive a full page reload, not just tool navigation** — reminders are
  persisted to `localStorage` (`beths-gang:reminders`) and reloaded on mount, not just
  held in memory.
- **Must fire on its own schedule regardless of what's on screen** — a `setInterval`
  (15s) inside the provider checks every reminder's `fireAt`/`warnBeforeMinutes` against
  `Date.now()`, independent of any component being mounted or visible.

**Catch-up on mount:** a reminder whose `fireAt` already passed while the tab was closed
fires its "due" event once, immediately, on the next load — instead of being silently
lost, but without spamming one event per missed occurrence for a long-closed tab.

**StrictMode-safety, on purpose:** `checkReminders()` computes the new reminders array
and any newly-fired events as plain values *first*, then commits them — deliberately not
a `setState(prev => ...)` updater with side effects (banner events, browser
notifications) inside it, since React Strict Mode may invoke such updaters twice in
development. This is the Pomodoro pop-sound bug's lesson (`designs/
distract-me-and-pomodoro.md`) applied preemptively rather than rediscovered the hard way
a second time. The mount-time catch-up call is separately guarded by a `useRef` flag
(not state) so Strict Mode's mount→cleanup→mount dev cycle can't run it twice either.

**Notifications:** the in-app banner (originally `ReminderBanner`, later renamed
`AlertBanner` and shared with Timetable's own alerts — see `designs/timetable.md`;
rendered unconditionally in `App.tsx`, top-center) is the guaranteed channel. The
browser's Notification API is used best-effort on top of it — permission requested on
first `addReminder` call (a user
gesture, satisfying the browser's permission-prompt requirement), and a failed or denied
notification never blocks or replaces the in-app banner.

## Repeat model

`RepeatRule` is a discriminated union: `none | daily | weekdays | { interval; amount;
unit }`. `daily`/`weekdays` advance by calendar days off the *previous* `fireAt`
(correct across DST, since `Date`'s `setDate` handles that); `interval` just adds
`amount * unitMs`. `computeNextOccurrence()` is a pure function specifically so this
logic is unit-testable without mocking the whole provider. This is the same "push
evolving structure into one flexible field, not new columns" idea noted in `designs/
architecture-overview.md` — `repeat` is stored as one JSON-serializable field, which is
exactly the shape `designs/user-personalization.md`'s Phase 2 plan expects to reuse
directly when Reminders gets a real per-user DynamoDB model.

## Supporting UI

- **Active Reminders list:** shows "Reminder: <time>" and "Warning: <time>" as two
  separately labeled lines (not a single line with a vague relative "warns 20 min
  before") — added directly from feedback that times needed to be "set clearly."
- **Home-tile badge:** a live count of active reminders on the Remind Me tile
  (`ToolCard`'s new optional `badgeCount` prop, decided by `Home.tsx` rather than made
  generic infrastructure nothing else needs yet).
- **The plain form was built, then removed the same day** — shipped alongside the
  natural-language input as a structured fallback, then removed entirely per direct
  feedback that it "looked ugly" next to the text box, since natural language already
  covered everything the form did (including the warning clause). Worth remembering:
  offering two ways to do the same thing isn't automatically more flexible if one of
  them is worse UX for no added capability.

## Testing approach

`src/lib/reminderParser.test.ts` — the parser is pure and fully deterministic, so every
phrasing correction above has a direct regression test, including the exact user-supplied
example phrases. `src/context/RemindersContext.test.tsx` — fake-timer tests of the
warning/due/repeat-rescheduling flow and the catch-up-on-mount path. `src/tools/
remindMe/index.test.tsx` — component tests for the live preview and form interactions.
Real end-to-end confidence (global firing while a different tool is open, survival across
an actual page reload) came from Playwright against the real dev server, not just unit
tests — the specific thing being proven (does this actually fire when I'm not looking at
it) isn't fully provable any other way.

## Known limitation, noted but not built

Non-AI tools' actions beyond "opened" (a reminder being *created*, specifically) aren't
captured by usage logging — see `designs/usage-logging.md` and `TODO.md`'s "Action-level
usage events for non-AI tools" for why, and what it would take.
