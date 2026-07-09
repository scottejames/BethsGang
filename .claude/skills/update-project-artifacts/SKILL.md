---
name: update-project-artifacts
description: Use this immediately after completing a significant feature, tool addition, architecture change, or notable bug fix in this project (Beth's Gang) — before telling the user the work is done. Also invocable directly as /update-project-artifacts. Walks through updating CHANGELOG.md, TODO.md, README.md, OPERATE.md, and the designs/ folder, verifying the change with npm run verify, and confirming new files are actually tracked by git, so no project artifact silently falls out of sync with what was actually built. Skip for genuinely trivial edits (typo fixes, comment-only changes, formatting) — this is for anything you would otherwise describe to the user as "I added/changed/fixed X."
---

# Keep project artifacts current

This project has already been bitten twice by skipping steps in this checklist: a build
that failed because a new tool's files were never committed, and a bug (`pop.mp3` firing
twice) that only a real test caught after the code "looked right." Treat this checklist
as part of finishing the task, not an optional extra pass at the end.

## 1. Verify the change actually works

- [ ] Run `npm run verify` (lint + Amplify backend typecheck + build + test). Don't
      report something as done on the strength of "the code looks right."
- [ ] If the change touches the UI, actually look at it — render it (a Playwright
      screenshot against the dev server, or the project's own test suite) rather than
      trusting your mental model of the CSS. A control that looked fine in the diff has
      turned out to be visibly wrong before.
- [ ] If the change touches AI tool behavior (a new/edited system prompt, a new entry in
      `USER_MESSAGE_BUILDERS`, anything in the energy-instruction envelope in
      `amplify/functions/ai-assist/handler.ts`), add or update a test in
      `handler.test.ts` rather than only eyeballing it.
- [ ] If you find yourself testing something by hand more than once, write it down as a
      real test instead — see `OPERATE.md`'s "Test" section for the patterns already in
      use (fake timers, mocked `HTMLMediaElement.play`, the `@vitest-environment node`
      override for backend tests).

## 2. Update CHANGELOG.md

- [ ] Add an entry under today's date (`## YYYY-MM-DD` — start a new heading if the date
      has rolled over since the last entry; otherwise append to the existing day's
      section).
- [ ] File it under `### Added` / `### Changed` / `### Fixed`, whichever actually applies.
- [ ] Say *why*, not just *what*, wherever the reason isn't obvious from the words alone
      — that's the standard the existing entries in this file already hold to (e.g.
      explaining why `npm ci` became `npm install`, not just that it did).

## 3. Update TODO.md

- [ ] If this shipped something already tracked as a backlog idea, move it out of
      wherever it was (`Up next` / `Later` / `Infrastructure`) and into `Shipped`,
      checking the box.
- [ ] Fix any other bullet in the file that cross-references the thing you just shipped
      as if it were still pending (this file has had stale cross-references before —
      e.g. a bullet pointing at an "Infrastructure" section that had since been removed).
- [ ] If the work surfaced a genuinely new idea, limitation, or natural follow-up, add it
      as a new bullet rather than letting it evaporate at the end of the conversation.

## 4. Update README.md — only if this changed

- [ ] A new dependency → add a row to the Dependencies table.
- [ ] A new architectural pattern worth reusing (a new global Context/Provider, a shared
      mechanism like the AI-tool envelope, a new reusable component like `Modal.tsx`) →
      add a short note near the closest existing example of that pattern, so the next
      thing that needs it has a pointer instead of reinventing it.
- [ ] A new externally-sourced asset (audio, image, icon) → add it to the "Assets"
      section with its license and source now, before it's unclear later which license
      applied to which specific file.

## 5. Update OPERATE.md — only if this changed

- [ ] A new npm script, a new prerequisite, a new "how to run/test this" step → add it
      here. CHANGELOG.md records that a script now exists; OPERATE.md is where someone
      actually goes to run it — both need to be right, but they're not the same job.

## 6. Update the designs/ folder — only if this changed something design-worthy

`designs/README.md` indexes the set; `designs/design-principles.md` holds the standing
principles. Neither should drift from what was actually built — a stale design doc
actively misleads instead of just being silent.

- [ ] Did this introduce a new architectural decision, reject a real alternative, get
      shaped by a bug, or ship a meaningfully new feature/service? Add or update the
      relevant document in `designs/` — most changes extend an existing document (check
      `designs/README.md`'s table for the closest match) rather than needing a new one.
- [ ] Does this confirm, refine, or contradict an existing entry in
      `design-principles.md`? Update that entry (with what actually happened, not just
      the abstract principle) rather than leaving it to only live in this conversation.
- [ ] If this is a genuinely new document, add a row to `designs/README.md`'s index table
      so it's discoverable.
- [ ] Skip this step for changes that don't reflect a design decision worth remembering
      later — same "genuinely trivial" bar as the rest of this skill.

## 7. Confirm git actually has everything

- [ ] Run `git status --short` and read it — don't assume. New files show as `??` until
      staged; a commit that references a file which was never added will build locally
      (it's on disk) and break in CI (it isn't in the repo) — this has happened on this
      project already.
- [ ] Scan the diff for anything that shouldn't be committed before handing back — a
      quick `git diff --cached | grep -iE "api[_-]?key|secret|token"` costs nothing.

## 8. Hand back to the user

- [ ] Don't commit or push unless asked — this project's user runs git themselves. End
      by summarizing what changed and asking whether they want it committed/pushed.
