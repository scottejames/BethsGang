# Pre-launch bug review — 2026-07-10

QA pass ahead of opening the app to more users. Methodology: read every design doc,
`CHANGELOG.md`, and `TODO.md` to establish documented/expected behavior; read every
tool's and shared context's source against that; ran `npm run verify` (clean — 155
tests pass); then drove the real dev server with a headless Chromium (Playwright,
network-mocked for AI calls, same approach the project's own verification passes use)
to confirm or rule out the issues found by reading. Nothing below has been fixed —
this is a list to work through together.

Each entry is tagged:
- **Confirmed live** — reproduced against the running app with a screenshot/DOM check.
- **Confirmed by code trace** — not exercised live (needs a signed-in sandbox session,
  or a multi-day clock gap), but the code path is unambiguous.

---

## 1. Double-clicking "Send to Everything Pile" / "Send N to Everything Pile" creates duplicates

**Severity: High** · **Confirmed live** · **FIXED**

Fixed with a `ref`-based one-shot guard (checked-and-set synchronously, so it can't be
bypassed by two click handlers running back-to-back before React re-renders a disabled
button) in `taskBreakdown/index.tsx`, `brainDumpSorter/index.tsx`, and
`sideQuestLog/index.tsx`'s `promoteEntry`. Re-verified live: the exact double-click
repro that produced 2 duplicate projects/6 duplicate tasks before the fix now produces
exactly 1 project and 3 tasks, no console errors. `npm test` still green (157 passed).

**Where:** `src/tools/taskBreakdown/index.tsx` (`handleSendToEverythingPile`, ~line 58)
and `src/tools/brainDumpSorter/index.tsx` (`handleSend`, ~line 127).

**Repro:** Break a task down (or sort a brain dump), then click the send button twice
in quick succession (a normal fast double-click, no special timing needed).

**Actual:** Confirmed live via Playwright — sending "Clean the kitchen" and
double-clicking produced **two separate "Clean the kitchen" projects**, each with the
same 3 steps (6 tasks total instead of 3). Same reproduction in Brain Dump Sorter
produced 4 tasks ("Buy milk", "Call dentist" each twice) instead of 2.

**Expected:** One send, one project/task set, regardless of click speed.

**Cause:** Neither send button has a `disabled`/one-shot guard. Task Breakdown's
handler also calls `addProject(task.trim())` fresh on every invocation when there's no
`origin` project, so a second click doesn't just duplicate tasks — it creates a whole
second project to hold them.

**Note:** Side Quest Log's "Make it a task" (`src/tools/sideQuestLog/index.tsx`,
`promoteEntry`) is the same shape (calls `addTask` with no guard) but is lower risk in
practice, since the entry is removed from local state as part of the same call, which
narrows (but doesn't eliminate) the double-click window.

---

## 2. Repeating reminder with no explicit time gives a nonsensical error

**Severity: Medium** · **Confirmed live** · **FIXED**

Fixed by replacing the `fireAt = now` placeholder (which always tripped the
in-the-past check right after) with an early, specific rejection — same shape as the
existing no-repeat "couldn't work out when" message. Added two unit tests
(`reminderParser.test.ts`) for the daily and weekdays no-time cases; `npm run verify`
green (159 tests).

**Where:** `src/lib/reminderParser.ts`, lines 231–235 (the `daily`/`weekdays` fallback
sets `fireAt = now`) and line 237 (`fireAt.getTime() <= now.getTime()` check).

**Repro:** In Remind Me, type `remind me every day to take meds` (no time given).

**Actual:** Preview shows **"That's in the past — try a time after now."** Confirmed
live. Compare `remind me in 20 mins to have lunch`, which correctly previews.

**Expected:** Since the user gave no time at all, the message should say so (e.g. "add
a time, like 'at 9am'") — not claim the (unspecified) time is in the past. Every other
"couldn't parse" path in this file has a specific, accurate reason string; this is the
one case that doesn't.

---

## 3. Home's "General Purpose" / "Planning" tabs don't behave like ARIA tabs

**Severity: Medium (accessibility)** · **Confirmed live** · **FIXED**

Fixed via the simpler of the two options (dropped the ARIA tabs contract rather than
implementing full arrow-key nav + tabpanels, since these two buttons are a plain
category filter, not independent tabpanels): `role="tablist"`/`role="tab"`/
`aria-selected` replaced with `role="group"` + `aria-label="Tool category"` on the
wrapper and `aria-pressed` on each button — an accurate toggle-button-group contract
that doesn't imply keyboard behavior that isn't there. `Home.test.tsx` updated to
match (`getByRole('button', ...)` + `aria-pressed`). Re-verified live: no
`role="tab"`/`role="tablist"` left in the DOM, `aria-pressed` correctly tracks the
active tab. The related Everything Pile disclosure-toggle gap (no `aria-controls`)
noted alongside this one was **not** touched — separate, lower-severity, left open.
`npm run verify` green (159 tests).

**Where:** `src/components/Home.tsx` (new, currently uncommitted — the tab bar added
today per `CHANGELOG.md`'s 2026-07-10 entry).

**Actual:** The markup uses `role="tablist"` / `role="tab"` / `aria-selected`, which
tells assistive tech and keyboard users to expect the standard ARIA Tabs pattern
(arrow-key navigation between tabs, `aria-controls` pointing at the panel). Confirmed
live: `aria-controls` is `null` on both tab buttons, and pressing `ArrowLeft` while the
"Planning" tab is focused does nothing — only a mouse/Enter click switches tabs.

**Expected:** Either implement the full pattern (arrow-key switching + `aria-controls`
+ an `id`'d tabpanel wrapping `.tool-grid`), or drop the `role="tab"/"tablist"` ARIA
roles and just style them as plain toggle buttons — the current half-state actively
misleads screen reader / keyboard users into expecting behavior that isn't there.

**Related, smaller version of the same gap:** Everything Pile's project-group
disclosure toggles (`.task-group-toggle`, `src/tools/everythingPile/index.tsx` ~line
294) have `aria-expanded` but no `aria-controls` linking to the group body they
expand — lower severity since disclosure buttons don't carry the same keyboard-nav
expectation tabs do, but worth fixing in the same pass if you're in this code.

---

## 4. README.md says auth "not yet merged to main" — it already is

**Severity: Low (documentation, but actively misleading)** · **Confirmed by code trace** · **FIXED**

Removed the `(feature/user-accounts branch, not yet on main)` and `(same branch)`
qualifiers from the Auth and Per-user persistence bullets in README.md's Architecture
section — both now describe these as what they are: live on `main`.

**Also fixed (same root issue, found while fixing this):**
- `OPERATE.md`'s two section headings ("Testing auth locally (`feature/user-accounts`
  branch)", "Testing per-user Reminder/Spoons persistence (same branch)") — branch
  qualifiers dropped from both.
- `designs/README.md`'s table entry for `user-personalization.md` — now describes
  Phases 1–3 as shipped on `main`, instead of only "Phase 1 done" + "the Phase 2 plan."

**Where:** `README.md`'s Architecture section ("Auth (`feature/user-accounts` branch,
not yet on `main`)...") and the "Per-user persistence (same branch)" paragraph right
after it.

**Actual:** `amplify/auth/resource.ts`, `src/context/AuthContext.tsx`,
`src/components/AccountButton.tsx`, and the owner-scoped `Reminder`/`UserPreferences`/
`Project`/`Task` models in `amplify/data/resource.ts` are all present and wired up on
`main` right now (confirmed via `git branch --show-current` + `git ls-tree`). `TODO.md`
and `CHANGELOG.md` both correctly show these phases as shipped.

**Expected:** README should describe auth/per-user persistence as live on `main`, not
as an unmerged branch feature — worth a quick pass before pointing new users/readers at
it, since it's the architecture doc.

---

## 5. A long-offline repeating reminder fires a rapid burst of duplicate "due" banners

**Severity: Medium** · **Confirmed by test** (red/green — a fake-timer test in
`RemindersContext.test.tsx` reproduced it directly, no live multi-day clock gap
needed) · **FIXED**

Wrote the test first: a daily reminder 50 hours overdue, asserting exactly one `due`
event and the reminder already at a future occurrence — failed against the old code
(`1783404000000` not `> 1783497600000`, i.e. still a day in the past after the first
catch-up step). Fixed `checkReminders` in `RemindersContext.tsx` to loop
`computeNextOccurrence` until the result is actually in the future, instead of
advancing exactly one occurrence per 15-second check — now fires exactly one `due`
event per reminder per check, matching how a one-shot reminder's catch-up already
worked. Test now green; `npm run verify` clean (160 tests).

**Where:** `src/context/RemindersContext.tsx`, `checkReminders()` (lines 237–283) +
`computeNextOccurrence()` (lines 88–107).

**Trace:** When a repeating reminder's `fireAt` has passed, `checkReminders` advances
it by exactly **one** occurrence (`computeNextOccurrence`) and pushes one `due` event.
The 15-second interval (`CHECK_INTERVAL_MS`) then runs again — if the new `fireAt` is
*still* in the past (e.g. a daily reminder left un-caught-up for 3+ days), the same
reminder fires again, advances again, and repeats. Since `ReminderBanner.tsx` has no
auto-dismiss and just appends to a stack, the practical effect is a burst of several
"Reminder: ..." banners appearing roughly once every 15 seconds until the reminder
catches up to the present — rather than a single silent catch-up (which is the
documented, tested behavior for *one-shot* reminders, per `RemindersContext.test.tsx`'s
catch-up test, but that test doesn't cover a multi-occurrence-behind repeating one).

**Expected:** Worth deciding deliberately — either catch up silently to the next future
occurrence (no fired events for the missed ones), or fire once with a "you missed a few
of these" framing, rather than the current one-event-per-15-seconds burst.

---

## 6. Brief flash of the wrong data on page reload while signed in

**Severity: Low–Medium** · **Confirmed by code trace** · **FIXED (scoped down)**

Considered a full fix (delay all three providers' local-data population until the
auth check resolves) but rejected it: it would have also delayed
`RemindersContext`'s mount-time catch-up check — a real, tested reliability
guarantee (a reminder overdue while the tab was closed firing on reopen) — trading a
brief cosmetic issue for a functional regression. A render-only gate (leave
provider state/effects untouched, just don't *display* it during the loading window)
avoids that risk but still requires every consumer to await the auth check before
asserting in tests, which is real cost across several files/components.

Scoped down to just the highest-visibility spot: Remind Me's "Active reminders" list
(`remindMe/index.tsx`) now shows a neutral "Loading…" placeholder instead of local
reminders while `useAuth().loading` is true, instead of local storage.
`EnergyButton`'s spoons badge and `EverythingPile`'s task tree still have the
underlying flash risk — left open, not fixed in this pass.

Test written first (red/green): `remindMe/index.test.tsx`'s new test asserts neither
the stale local reminder nor "No reminders set yet." shows while `getCurrentUser()`
is still pending, only "Loading…" — confirmed failing against the pre-fix component
(showed the stale reminder immediately) before applying the fix. All 6 pre-existing
tests in that file needed their `renderTool()` calls to become `await renderTool()`
(centralized in the helper), since they all previously asserted synchronously before
the auth check had a chance to resolve. `npm run verify` clean (161 tests).

**Where:** `src/context/AuthContext.tsx` (`loading` starts `true`, `user` starts
`null`) feeding into `RemindersContext.tsx`, `EnergyContext.tsx`, and
`TaskStoreContext.tsx`, all of which key their signed-in/signed-out branching purely
off `isSignedIn` (`user !== null`) with no awareness of `loading`.

**Trace:** On every page load, `isSignedIn` is `false` until the async
`getCurrentUser()` check resolves — during that window, a signed-in user's reminders/
spoons/tasks briefly render whatever's left in this device's `localStorage` (which, by
design, is deliberately *not* kept in sync while signed in) before flipping over to the
real account data once the session check completes and `observeQuery` responds. For a
returning signed-in user this could show a stale or empty state for a moment on every
reload, which could read as "my reminder disappeared."

**Expected:** Worth deciding if this is acceptable (it's brief) or if these providers
should gate on `AuthContext`'s `loading` flag before rendering anything derived from
`isSignedIn`.

---

## 7. No size limit or rate limiting on the public AI endpoint

**Severity: Medium (cost/abuse exposure, relevant now you're opening this up)**
**Confirmed by code trace** · **REVIEWED — not fixing.** Decided acceptable at
current scale (Anthropic API is internet-scale infrastructure; not a meaningful risk
here). Left as-is, no code changes.

**Where:** `amplify/data/resource.ts`'s `runAiTool` (`allow.publicApiKey()`, no
per-caller limits) and `amplify/functions/ai-assist/handler.ts`'s handler — no
length check on `input` before it's sent to `client.messages.create()`.

**Trace:** Every tool's textarea (Task Breakdown, Tone Checker, Brain Dump Sorter,
etc.) has no `maxLength` and no client-side size guard; the Lambda passes whatever it's
given straight to Claude. Since `runAiTool` is unauthenticated (public API key, by
design, so signed-out users get full AI functionality), there's currently nothing
between "someone finds the API key in the bundled JS" (which is unavoidable for a
public API key, not a bug on its own) and unbounded Anthropic API spend — no per-IP/
per-key rate limit, no request size cap.

**Expected:** Not necessarily a "fix the code" item — more a "decide if this is an
acceptable risk at your current scale" conversation, since a public-API-key SPA has
limited options here (WAF rate limiting, a max input length, or a spend alert on the
Anthropic account are the usual mitigations).

---

## 8. Deleting a task in Everything Pile is instant, unconfirmed, and unrecoverable

**Severity: Low** · **Confirmed by code trace** · **FIXED**

Built a reusable soft-delete pattern: `src/hooks/useUndoableDelete.ts` (item
disappears from the list immediately, the real delete only commits after a 5-second
grace window) + `src/components/UndoToastStack.tsx` (a bottom-right toast stack,
same visual pattern as the existing reminder-banner stack — top-center/bottom-center/
top-left/top-right were all already taken). Wired into all three genuinely
destructive delete actions found across the app: Everything Pile's task Delete,
Dopamine Menu's item Delete, and Side Quest Log's Done/Bin it (deliberately *not*
"Make it a task" — that one's content survives as a task elsewhere, nothing to undo).

Tests: `useUndoableDelete.test.ts` covers the hook directly (pending state, commit
after timeout, undo cancels commit, multiple concurrent pending deletes tracked
independently). Each of the three tools got an integration test (delete → toast →
Undo → restored; delete → window elapses → actually gone from the store) —
confirmed red without the fix (git-stashed `everythingPile/index.tsx` alone and
re-ran its two new tests, both failed as expected) before applying it. `npm run
verify` clean (169 tests, up from 161 before this fix).

**Where:** `src/tools/everythingPile/index.tsx`, the task row's "Delete" button (~line
441): `onClick={() => deleteTask(task.id)}` — no confirmation, no undo.

**Contrast:** Deleting a *project* in the same tool is safe-by-design — its tasks are
detached, not destroyed (`TaskStoreContext.deleteProject`). Deleting a *task* has no
equivalent safety net; the title/size/category/done-state are gone immediately on a
single misclick, whether signed in (DynamoDB delete) or not (localStorage).

**Expected:** Worth a "confirm" or a brief "Deleted — Undo" toast, consistent with how
carefully the project-deletion path was designed. Same applies to Dopamine Menu's
per-item delete and Side Quest Log's "Bin it", though those are lower-stakes (one line
of text vs. a task's full metadata).

---

## Minor / low-priority notes

- **`src/lib/reminderParser.ts`, `warnBeforeMinutes: 0`** — a reminder with an
  explicit "0 minutes before" warning is treated as falsy in
  `RemindersContext.tsx`'s `checkReminders` (`working.warnBeforeMinutes && ...`), so
  the warning event silently never fires even though the Remind Me UI shows a
  "Warning:" line for it in the preview and active list. Low impact (a 0-minute warning
  and the reminder itself land at the same instant anyway, so there's little practical
  difference), but worth knowing about if `warnBeforeMinutes` semantics change later.
- **`EnergyContext.tsx`'s brand-new-account reconciliation** (lines 54–83) has a narrow
  theoretical race: if the Spoons slider is moved in the few hundred ms between
  sign-in and the reconciliation effect's `UserPreferences.create()` call finishing,
  both the reconciliation's `create()` and `setSpoons`'s own `update()`→`create()`
  fallback could race for the same singleton row. Not verified live (would need a real
  sandbox and precise timing); flagging as a "look at if it comes up," not a confirmed
  bug.

---

## What wasn't tested

No `ampx sandbox` was running this session, so nothing that requires a real signed-in
backend round trip (Reminder/Spoons/Task Store DynamoDB sync, the localStorage→account
migration on first sign-in, cross-device `observeQuery` updates, the Authenticator
sign-up/sign-in/forgot-password flows) was exercised live — items 5, 6, and the
EnergyContext note above are code-trace only for that reason. Everything else
(all 12 tools' signed-out/local-only paths, the Home tabs, AI-tool flows with the
network mocked, `npm run verify`) was exercised directly.
