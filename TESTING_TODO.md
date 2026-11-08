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

## Done

Move finished items here with the date and the test file that covers them.

- [x] **2.10 Parser tolerates markdown** (2026-11-08). Decided yes: `**Tone:**`, `**Tone**:`
      and `## Tone:` are all read, without touching the value. The Lambda's format guard
      stays as the first line of defence. `src/lib/parseLabeledOutput.test.ts`.
- [x] **3.4 Failed live update warns** (2026-11-08). Decided yes, telling the person to
      reload. Amplify recovers from brief dropouts without reporting an error, so this only
      fires when the connection has really failed. `src/context/saveWarnings.test.tsx`.
- [x] **3.5 Retry a failed move of local data** (2026-11-08). The "already moved" flag is
      only set once everything arrives, and "already exists" counts as arrived.
      `src/lib/saveFailures.test.ts`, `src/context/saveWarnings.test.tsx`; the real server
      answer is confirmed by `live/backend.live.ts`.
- [x] **3.6 Empty AI answer** (2026-11-08). Shows an error asking the person to try again.
      `src/hooks/useAiTool.test.ts`.
- [x] **5.3 When live checks run** (2026-11-08). Not on every deploy, since each run makes
      real Anthropic calls. They're rerun whenever a change touches code they cover; the
      list is in `.claude/skills/update-project-artifacts/SKILL.md`, step 1.
- [x] **5.1 Automated live AI check** (2026-11-08). `npm run test:live`, sandbox only:
      AI and usage logging signed out and signed in. Putting the August bug back in the
      sandbox failed this check with the original "Not Authorized" error. `live/backend.live.ts`.
- [x] **5.2 Live data check** (2026-11-08). Owner create, read, update and delete on all
      five models; another user and a signed-out visitor are refused. Loosening Reminder's
      rule in the sandbox failed the check. `live/backend.live.ts`.
- [x] **5.4 Browser end-to-end test** (2026-11-08). Sign in, AI tool, reminder, reload, sign
      out, sign back in, against the sandbox. `e2e/account.e2e.ts`.
- [x] **5.5 PWA check** (2026-11-08). Manifest and icons, local tools offline, and a new
      deploy reaching an installed app. The browser's install prompt itself isn't exercised.
      `e2e/pwa.e2e.ts`.
- [x] **5.6 Cross-device sync** (2026-11-08). A reminder added in one signed-in browser
      session appears in another, and a cancel carries back, with no reload.
      `e2e/account.e2e.ts`.
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
- [x] **4.1 Every tool opens** (2026-11-08), through the real provider stack, now shared
      with `main.tsx` in `src/AppProviders.tsx`. Also checks the registry is complete and
      `SaveFailureNotice` is mounted. `src/App.test.tsx`.
- [x] **4.2 Distract Me** (2026-11-08), including audio surviving a tool switch.
      `src/context/DistractMeContext.test.tsx`, `src/App.test.tsx`.
- [x] **4.3 Pomodoro** presets, stop and resume, reset (2026-11-08).
- [x] **4.4 `AccountButton` and `EnergyButton`** (2026-11-08).
- [x] **4.5 Reminder browser notifications** (2026-11-08).
      `src/context/RemindersContext.notifications.test.tsx`.
- [x] **4.6 Double-click protection** in all four tools that use it (2026-11-08).
- [x] **4.7 Minimum coverage** set in `vite.config.ts` (2026-11-08), checked by
      `npm run coverage` but not on deploys. Coverage after Phase 4: 97.3% lines, 88.4%
      branches, 95.9% functions.
