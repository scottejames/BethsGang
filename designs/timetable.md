# Timetable — Design Document

**Status:** Shipped on `main`. Built from a prototype (an HTML/CSS/JS Artifact, styled to
match the app, published for direct reaction since the requestor is non-technical) that
was approved as-is, then ported into idiomatic React on top of this doc's original
skeleton. The open questions below are resolved with what was actually decided/built,
not left open — see each one's own note for why.

## The ask

A requestor asked for: "Add timetable which will give alarms when lesson starts in the
next 15 mins."

## Why this isn't just another Remind Me

Remind Me (`designs/remind-me.md`) is one-shot-or-simple-repeat: a single `fireAt`
timestamp plus an optional `RepeatRule` (`none | daily | weekdays | interval`). A
timetable is structurally different in a way that matters for the data model, not just the
UI:

- **It's a whole week's shape, set up once.** A student doesn't create seven separate
  "remind me at 9am" reminders and separately remember Tuesday's are different from
  Monday's — they lay out a week (Monday: Maths 9–10, English 10–11, ...; Tuesday:
  different lessons) and expect it to just recur.
- **"Last Monday is likely to be the same as this Monday"** is the core insight the
  requestor named directly, and it points at the right model directly: entries are stored
  by **day-of-week**, not by date. A weekly recurring shape needs zero explicit repeat-rule
  field at all — unlike `Reminder.repeat`, there's nothing to "advance" from one
  occurrence to the next, since "which entries are today's" is just a lookup by today's
  weekday. This is simpler than Remind Me's repeat model, not a bigger version of it.
- **It's plural and structural, not a single alarm.** The natural unit is "a week", set up
  and edited as a whole, not one entry created at a time via a text box the way Remind Me
  is.

## Reacting to a non-technical requestor: a working prototype, not just a doc

The requestor isn't a developer, so a design doc alone wasn't something they could
meaningfully react to. Before writing any real app code, a **standalone HTML/CSS/JS
prototype** was built and published as a Claude Artifact — self-contained, no build step,
styled with the app's exact CSS custom properties (`--accent`, `--rb1`..`--rb6`, the same
font stack) so it read as "this app," not a generic mockup. It included a fake "preview a
time" control so the requestor could jump the clock forward and watch the 15-minutes-
before alert actually fire, without waiting in real time. The requestor approved it as-is,
and it became the reference for the real implementation below — same weekly grid, same
"copy this day to…" interaction, same alert-banner wording.

## Data model: `TimetableEntry`

Follows `Reminder`/`Project`/`Task`'s existing shape exactly (see `amplify/data/
resource.ts`) — owner-scoped `a.model()`, client-generated id, plain string fields over
enums per `CODING_GUIDELINES.md` §5:

```ts
TimetableEntry: a
  .model({
    dayOfWeek: a.string().required(),       // 'monday' | ... | 'sunday' — plain string,
                                              // not a GraphQL enum, so it can evolve
                                              // (see CODING_GUIDELINES.md §5)
    startTime: a.time().required(),          // AWSTime; TimetableContext.tsx converts
    endTime: a.time(),                        // to/from this app's "HH:mm" client shape
    label: a.string().required(),            // e.g. "Maths", "Period 3: Chemistry"
    location: a.string(),                    // e.g. "Room 4B" — optional
    alertMinutesBefore: a.integer(),         // optional; unset means "use the default"
                                              // (15), same "explicit value always wins"
                                              // rule as Reminder.warnBeforeMinutes
  })
  .authorization((allow) => [allow.owner()]),
```

Client-side type mirrors this exactly (matching `Project`/`Task`'s interface style in
`TaskStoreContext.tsx`), and lives in `src/context/TimetableContext.tsx`:

```ts
export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayOfWeek = (typeof DAYS)[number];

export interface TimetableEntry {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;    // "HH:mm"
  endTime?: string;     // "HH:mm"
  label: string;
  location?: string;
  alertMinutesBefore?: number;
}
```

**No per-week exceptions/overrides** (e.g. "no lessons this Monday, it's a bank holiday")
— see Non-goals below; unchanged from the original proposal.

## Persistence: `TimetableContext`, same pattern as Reminders/Task Store

`src/context/TimetableContext.tsx`, following `RemindersContext.tsx`/`TaskStoreContext.tsx`
exactly (`designs/architecture-overview.md`'s persistent-provider pattern, extended the
same way `designs/user-personalization.md`'s Phase 2/3 already extended it twice):

- `localStorage` (`beths-gang:timetable`) as the full default when signed out — no login
  wall, same as everything else in this app.
- `TimetableEntry.observeQuery()`-driven backend state when signed in
  (`AuthContext.isSignedIn`), with the same silent first-sign-in migration from
  `localStorage` that `RemindersContext`/`TaskStoreContext` already do, and the same
  never-write-account-data-to-`localStorage`-on-sign-out fix both of those needed for
  real (see `designs/user-personalization.md`'s "What Phase 2 built").
- Client-generated ids (`crypto.randomUUID()`), optimistic local update then reconcile —
  same as every other context that talks to Amplify Data.
- `addEntry` / `updateEntry` / `deleteEntry` / `copyDay` / `dismissAlert` on the context
  value. `copyDay(sourceDay, targetDays)` **replaces** each target day's entries with
  fresh copies of the source day's (new ids, not shared) rather than merging — "copy
  Monday to Tuesday" is meant to set Tuesday's shape, not pile duplicates on top of
  whatever was already there.

## Notification mechanism

Reuses the "timer inside a persistent provider" shape from `RemindersContext`, but the
actual check is different in kind, not just parameters, because the source of truth is
"today's weekday entries," not a stored `fireAt`:

- A `setInterval` inside `TimetableProvider`, **30s** (coarser than Reminders' 15s — a
  15-minute alert window doesn't need to-the-second precision the way a reminder's exact
  `fireAt` does).
- Each tick: compute today's weekday, filter entries to that weekday, and for each one
  compute `alertAt = startTime - (alertMinutesBefore ?? 15)`. If `now` is in
  `[alertAt, startTime)` **and** this entry hasn't already fired today, fire an alert.
- **"Already fired today" tracking**: a key of `` `${entryId}|${dateStamp}` ``, checked in
  a `useRef` record (not persisted — losing this on a hard refresh at worst means one
  possible duplicate alert, a much smaller cost than Remind Me's
  `warnedForCurrentFireAt` needing to survive reload for a one-shot reminder). Naturally
  resets every day since the date is part of the key — no explicit "reschedule for next
  week" step the way `Reminder.repeat`'s `computeNextOccurrence()` needs one.
- **Catch-up on mount, narrower than Remind Me's:** if the tab opens while `now` is
  already inside an entry's alert window, fire once immediately (same instinct as
  Reminders' catch-up-on-mount). Unlike Remind Me, this **never** catches up for an entry
  whose `startTime` has already passed — a stale "starting in 15 min" for a lesson that's
  already 20 minutes in would be actively misleading, not just a missed courtesy notice.
  Verified directly: seeding a past-start entry and confirming zero alerts fire, alongside
  the positive case with a fake-timer test in `TimetableContext.test.tsx`.
- **StrictMode-safety**: `checkAlerts()` computes the tick's new alerts as a plain array
  first, then commits — same discipline as `RemindersContext.checkReminders()`, for the
  same dev-double-invoke reason (`designs/distract-me-and-pomodoro.md`).

## UI: a weekly grid + copy-day + add/edit modal

`src/tools/timetable/index.tsx`, porting the approved prototype directly:

- **The tool screen**: a 7-column grid (Monday–Sunday, all visible — weekend columns just
  show "No lessons yet" rather than being hidden, since some students do have weekend
  classes), each day showing its entries in start-time order. A lesson is a clickable
  card; clicking opens the same add/edit modal pre-filled. Each lesson's accent color is
  a deterministic hash of its own label (`colorForLabel` in `index.tsx`) — the same
  subject reads as the same color everywhere it appears across the week, a real pattern-
  recognition aid rather than decoration.
- **"Copy this day to…"** (⧉ button, shown once a day has at least one entry): opens a
  small day-picker modal, calls `copyDay`. This is what makes "easy to set up across a
  day" concrete rather than just a slogan — most weeks have several identical early
  patterns (same first-period every day, etc.), and this makes reusing Monday's shape a
  few clicks instead of manual re-entry.
- **Add/edit modal**: built with the existing `src/components/Modal.tsx` (the same one
  `EnergyButton`/`AccountButton` already use) rather than a new overlay component — day,
  start/end time, label, location, and a per-lesson alert-lead-time dropdown (default
  15 min). A "Delete lesson" action only appears when editing an existing entry.

## Alert surface: merged into a renamed `AlertBanner`

`ReminderBanner.tsx` (top-center, always-mounted, from `designs/remind-me.md`) is renamed
to **`AlertBanner.tsx`** and now reads from *both* `useReminders().firedEvents` and
`useTimetable().alerts`, rendering them into one merged stack. This resolves the original
open question directly:

- **Reuse vs. new banner** — reuse won. Every screen corner/edge is already claimed
  (`designs/architecture-overview.md`'s corner-claim table: `EnergyButton` top-right,
  `AccountButton` top-left, the banner top-center, `NowPlayingBar` bottom-center); a
  second independent fixed-position stack would either overlap the first or need to steal
  a slot from something else, and there's no natural second slot to give it. Two
  genuinely distinct event sources now feed one shared display — squarely the
  Rule-of-Three case `CODING_GUIDELINES.md` §1 describes, not a premature abstraction:
  `RemindersContext` and `TimetableContext` remain fully independent (their own storage,
  their own tick, their own state shape); only the rendering layer merges.
- Lesson alerts get their own CSS variant (`.alert-banner-lesson`, `--accent-2` left
  border) so they're visually distinguishable from a reminder's warning/due colors at a
  glance, without a different component.
- Verified directly (`AlertBanner.test.tsx`): seeding one fired reminder and one lesson
  alert through their real, separate contexts and confirming both render in the same
  stack, dismissible independently of each other.

## Non-goals for v1 (unchanged from the original proposal)

- **No per-occurrence exceptions** (holidays, one-off cancelled lessons). The whole
  design leans on "this week looks like every week" being true often enough to be worth
  the simplicity — revisit only if this turns out to matter in practice (probably a
  `TimetableEntry.activeFrom`/`activeUntil` pair, or a distinct `TimetableException`
  model).
- **No multi-week rotations** ("Week A / Week B" timetables). Would need an extra
  `weekParity` field and something to track which week is which — not built.
- **No "lesson starting now" alert**, only the N-minutes-before one the requestor
  explicitly asked for. Trivial to add later (same tick, a second window check) if
  wanted.

## Open questions from the original proposal — resolved

1. **Tool category** — `'study'`. Landed alongside Essay Phrase Bank, Assignment
   Breakdown, and Essay Structure Planner in the Study Help tab; the tool's own copy
   ("lesson", not a neutral "block"/"entry") follows from that choice.
2. **Alert banner: reuse or new** — reuse, merged into a renamed `AlertBanner`. See
   "Alert surface" above for the full reasoning.
3. **`alertMinutesBefore`: per-entry or one global setting** — kept per-entry, exactly as
   originally proposed (unset falls back to the 15-minute default). No feedback arrived
   suggesting the extra setup friction wasn't worth it, so the more flexible option
   shipped as designed.
4. **`endTime`: keep or drop** — kept. The approved prototype showed lesson blocks with a
   visible time range (e.g. "9:00am – 10:00am"), not just a start time, and that's exactly
   what shipped.
5. **Timezone/DST** — unchanged from the original proposal: entries are a wall-clock
   day+time with no timezone attached, the same "whatever 9am Monday locally means"
   intent as Remind Me's `daily`/`weekdays` repeat, DST-safe by the same construction.
   No issue found in testing; nothing further needed here.

## Testing approach

`src/context/TimetableContext.test.tsx` — the signed-out/signed-in split mirroring
`RemindersContext.test.tsx`'s own structure, including: alert firing inside the lead
window with the correct "starts in N minutes" text, no firing for a different weekday,
per-entry `alertMinutesBefore` overriding the default, catch-up-on-mount for an
already-in-window entry, **no** catch-up for an entry whose start already passed, firing
at most once per entry per day, CRUD operations, and `copyDay`'s replace-not-merge
semantics (client-side and backend create/delete calls both). `src/components/
AlertBanner.test.tsx` — the merge behavior described above. `src/tools/timetable/
index.test.tsx` — add/edit/delete through the real UI, and the copy-day flow end to end.

Real end-to-end confidence (the alert actually firing while a *different* tool — even
Home itself — is on screen, on the real system clock, in both themes) came from driving
the live dev server with Playwright: seeded an entry starting 7 minutes out via
`localStorage`, reloaded, and confirmed the banner appeared globally without the
Timetable tool itself being open — the same style of proof `designs/remind-me.md`'s
testing section used for its own "does this actually fire when I'm not looking at it"
question, since that isn't fully provable by unit tests alone.
