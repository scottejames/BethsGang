# Testing TODO

The plan for closing the gaps found in the 2026-11-08 test coverage review. Feature ideas
stay in [`TODO.md`](./TODO.md); this file is only about testing.

**Starting point (2026-11-08):** 244 tests, 81% line and 71% branch coverage. The logic
inside the app is tested well, but every test replaces Amplify with a mock, and deploys
don't run the tests.

**Why this exists:** from August to November 2026, every AI tool failed for signed-in
users. The unit tests couldn't see it, because the bug was in the agreement between the
app and the deployed backend, which is the part the mocks replace.

## Strategy

Each kind of test has one job. When a bug is fixed, add the test at the layer that would
have caught it.

| Layer | Job | Tool |
|---|---|---|
| **Unit and component** | Logic and UI behaviour inside the app. Mocks are fine here. | Vitest, Testing Library |
| **Contract** | The app and backend definitions agree, without calling AWS: auth rules, `authMode`, tool IDs. | Vitest against the generated schema |
| **Whole app** | The real providers and every tool work together. | Vitest, Testing Library |
| **Live** | The real deployed backend accepts and rejects the right callers. Small and few. | Script against a sandbox, Playwright where a browser matters |
| **Release gate** | A failing test stops a deploy. | `amplify.yml` |

Standing rules:

- Any change to auth rules or `authMode` must be tried both signed out and signed in.
- A bug fix comes with a test that fails without the fix.
- Prefer testing what the user sees over how the code is built.

## Phase 2: The AI path

- [ ] **2.10 Decide whether the parser should tolerate markdown.** A label like
      `**Tone:**` isn't recognised, so if the model ignores the format guard on some lines,
      those fields silently disappear. The guard is the only protection. **Needs a decision.**

## Phase 3: Failures users never see

- [ ] **3.4 Decide what a failed live update should do.** If the `observeQuery` connection
      that loads account data fails, it only writes to the console, so someone could be
      looking at out-of-date data. **Needs a decision**, because brief reconnects may be
      normal and a warning for those would be noise.
- [ ] **3.5 Retry a failed move of local data to an account.** At first sign-in, the
      "already moved" flag is set even if the move failed, so it is never retried. The
      user now gets a warning, but the data stays behind on that device.
- [ ] **3.6 Say something when an AI answer comes back empty.** The tool currently shows
      nothing at all.

## Phase 4: The app as a whole

- [ ] **4.1 Every tool opens.** Render `App` with the real providers and open every tool in
      the registry, then go back Home, with no crash. Also confirm `SaveFailureNotice` is
      mounted: nothing fails today if it is removed from `App`.
- [ ] **4.2 Distract Me:** audio keeps playing when switching tools, `NowPlayingBar` shows
      and stops it, and `DistractMeContext` start, stop and switch work.
- [ ] **4.3 Pomodoro:** presets, stop and resume, reset.
- [ ] **4.4 `AccountButton` and `EnergyButton`:** signed-in and signed-out display, opening
      the sign-in modal, signing out, changing spoons.
- [ ] **4.5 Reminder browser notifications:** permission requested once, shown when due,
      and the in-app banner still works if notifications are denied or unavailable.
- [ ] **4.6 `useOnceGuard` double-click protection** (`BUGS.md` #1), in each tool using it.
- [ ] **4.7 Set a minimum coverage threshold** once Phases 2 to 4 have raised the numbers.

## Phase 5: Live checks against real infrastructure

- [ ] **5.1 Automated live AI check**, `npm run test:live`, against a sandbox with a
      disposable Cognito test user: `runAiTool` and `logEvent` work signed out and signed
      in. This is the check that would have caught the August bug.
- [ ] **5.2 Live data check:** signed-in create, read and delete on each model, and a second
      user cannot read the first user's data.
- [ ] **5.3 Decide when live checks run:** by hand before a push, or automatically after
      each deploy. **Needs a decision**, since each run makes real Anthropic calls.
- [ ] **5.4 Browser end-to-end test (Playwright):** sign in, use an AI tool, add a reminder,
      sign out, and confirm account data disappears.
- [ ] **5.5 PWA check:** the app installs, the local tools work offline, and a new deploy
      reaches an already-installed app.
- [ ] **5.6 Cross-device sync:** a change in one session appears in another through
      `observeQuery`.

## Done

Move finished items here with the date and the test file that covers them.

- [x] **Phase 0: Confirm the signed-in fix on production** (2026-11-08). Checked by hand
      with Brain Dump Sorter: failing when signed in before the fix, and working both
      signed out and signed in after it. Live check only; the rules are guarded by
      `amplify/data/resource.test.ts`.
- [x] **1.1 Tests run on every deploy** (2026-11-08). In `amplify.yml`, before
      `ampx pipeline-deploy`. Build 49 proved a failing test stops the deploy with nothing
      released; build 50 proved passing tests let it through.
- [x] **1.2 Auth rule tests for the data models** (2026-11-08). All five models must be
      owner-only, and adding a model means updating the list. `amplify/data/resource.test.ts`.
- [x] **1.3 `dataClient` uses `authMode: 'userPool'`** (2026-11-08).
      `amplify/data/resource.test.ts`.
- [x] **1.4 Tool ID contract test** (2026-11-08). The Lambda's `SYSTEM_PROMPTS` keys must
      exactly match the IDs the tools call. `amplify/functions/ai-assist/handler.test.ts`.
- [x] **1.5 Coverage reporting** (2026-11-08). `npm run coverage`. Baseline: 81.3% lines,
      70.9% branches, 79.0% functions.
- [x] **2.1 The Lambda's real `handler`** (2026-11-08), with the Anthropic SDK mocked.
      `amplify/functions/ai-assist/handler.test.ts`.
- [x] **2.2 `useAiTool` and `aiClient`** (2026-11-08), through the real client code with
      only the network mocked. `src/hooks/useAiTool.test.ts`.
- [x] **2.3 `parseLabeledOutput`** (2026-11-08). `src/lib/parseLabeledOutput.test.ts`.
      Coverage after 2.1 to 2.3: 83.1% lines, 72.8% branches, 80.8% functions.
- [x] **2.4 to 2.7 Tone Checker, Reply Starter, Call Script, Is This Mad?** (2026-11-08).
      `index.test.tsx` next to each tool, including screenshot upload and paste.
- [x] **2.8 `imageCapture`** (2026-11-08). `src/lib/imageCapture.test.ts`.
- [x] **2.9 Task Breakdown** error state and double-send protection (2026-11-08).
- [x] **3.1 A failed save warns the user** (2026-11-08). Decided and built:
      `src/lib/saveFailures.ts` and `SaveFailureNotice`, which stays until dismissed.
- [x] **3.2 Failed saves tested** (2026-11-08) at all 22 save points, for both server errors
      and network failures. `src/context/saveWarnings.test.tsx`. Live-update errors moved
      to 3.4.
- [x] **3.3 `sendUsageEvent` can never break a feature** (2026-11-08).
      `src/lib/usageLog.test.ts`. Coverage after Phase 3: 92.0% lines, 81.9% branches,
      90.1% functions.
