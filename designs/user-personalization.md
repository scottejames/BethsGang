# User Personalization — Design Document

**Status:** Phase 1 (auth) and Phase 2 (Reminders + Spoons persistence) built and
verified on branch `feature/user-accounts`, not merged to `main`. Phase 3+ not started.

## Goal

Let a signed-in user's data (starting with Reminders) follow them across devices,
instead of being trapped in one browser's `localStorage`. Get there incrementally,
without ever making an account mandatory — this app's whole value is zero-friction,
quick-use tools, and a login wall would work directly against that.

## Non-goals (for now)

- No requirement to sign in to use any tool. `localStorage` remains the default for
  anyone not signed in, indefinitely.
- No social login (Google/Apple/etc.) — email + password only, to avoid OAuth client
  credential management for a personal-scale app.
- No migration of *every* piece of client state to the backend in one pass. Reminders and
  Spoons are the two candidates that exist today (the only two things that persist
  anything at all — see "Why Reminders first" below); everything else stays local-only
  until there's a real reason to change that.

## Architecture decisions

### Auth: Amazon Cognito via Amplify's `defineAuth`

Chosen over a third-party auth service (Auth0, Clerk, Firebase Auth) because the app is
already 100% Amplify — introducing a second platform/billing relationship would add
complexity for no real benefit here. `defineAuth({ loginWith: { email: true } })` gives
sign-up, email verification, login/logout, and password reset largely for free, backed
by a Cognito User Pool that Amplify provisions and wires into AppSync's authorization
model automatically.

**UI**: Amplify UI's `<Authenticator>` component rather than hand-built forms — it
handles verification codes, resend logic, and error states that would otherwise need
reimplementing. Retheme it to match this app's own colors (see "What Phase 1 built"
below) rather than accept its default look.

**Where user/password data actually lives, and how the password is protected**: with
`defineAuth({ loginWith: { email: true } })` and no further config, Cognito handles
identity storage entirely — there's no app-level table or code for this.

- *Storage*: a Cognito User Pool (one per environment/sandbox, provisioned by
  `defineAuth`) is the entire store — a fully-managed, multi-tenant AWS service, not a
  DynamoDB table or anything else visible/queryable in this AWS account. Each user
  record holds a `sub` (immutable UUID, the real identifier), the `email` attribute, an
  `email_verified` flag, account status, and timestamps. `aws cognito-idp list-users`
  (see `OPERATE.md`'s admin commands) can list these — but that API, and every other
  Cognito API, never returns password material in any form.
- *Password protection*: the password is sent once, over TLS, during sign-up — Cognito
  stores only a salted hash of it, never the plaintext, and there is no API to read a
  password or its hash back, even for the AWS account owner. It's opaque by design. Login
  itself uses Amplify's default `USER_SRP_AUTH` flow (Secure Remote Password) — client
  and Cognito exchange cryptographic proofs derived from the password, so the password
  typically doesn't cross the network again after the original sign-up/reset. Verification
  codes, reset tokens, and session/JWT tokens are all managed and rotated by Cognito;
  this app's Lambdas and frontend never see or handle a raw password.
- *Password policy*: Cognito's default, since nothing overrides it — minimum 8
  characters, requires upper case, lower case, a number, and a special character. This is
  the source of the Authenticator's own validation messages ("Password must have special
  characters" etc.), not custom app logic.
- **Net effect**: this app has zero password custody at any point in the flow — sign-up,
  verification, storage, and login are entirely Cognito's responsibility. That's the main
  reason to use it here over rolling auth storage yourself.

### Storage: DynamoDB via Amplify Data `a.model()`

Not a relational database (Amplify Gen2 can also front RDS/Aurora Postgres via
`sqlSchema`) — that would be real operational overhead (a running instance vs.
serverless, pay-per-request DynamoDB) for data that doesn't need it: no cross-user joins,
no reporting queries beyond what the usage-logging CloudWatch data already gives, just
small per-user records fetched by owner. `a.model()` gives DynamoDB tables, CRUD
resolvers, and real-time subscriptions "for free," and `allow.owner()` authorization is
natively wired into the same AppSync layer already in use for `runAiTool`/`logEvent`.

### Schema evolution strategy

DynamoDB is schemaless at the storage layer, which changes the usual "migrations" story:

- **Adding a model, or a new *optional* field, is non-destructive** — existing rows
  simply don't have the field until something writes it. No backfill required before
  deploying, no downtime. This covers the overwhelming majority of future changes.
- **Tightening an optional field to `.required()` later, or removing/renaming a field**,
  are the risky moves — those need a one-time backfill script (a small Lambda or local
  script using the Data client with elevated IAM permissions) or a deprecation window
  (write the old and new shape together for a while, confirm nothing depends on the old
  one, then remove) respectively. Not needed yet, but the pattern to reach for when it
  is.
- **No migrations framework** (Prisma Migrate, Flyway-style) — that tooling exists
  because rigid relational schemas need it; DynamoDB doesn't, so Amplify Gen2 doesn't
  provide an equivalent. The "migration" for additive changes is just the next deploy.
- **Keep evolving shapes inside one flexible field, not new columns** — this codebase
  already leans on this client-side (`RepeatRule`'s discriminated union gets
  `JSON.stringify`'d as a single structured payload, same as ReplyStarter/CallScript/
  IsThisMad's inputs). Doing the same server-side (one JSON field per model that can
  grow new variants) keeps the *schema* change surface small even as what's inside it
  evolves.
- **Workflow**: `ampx sandbox` (a personal, fully separate AWS stack — see
  `OPERATE.md`'s "Local development" and "Testing auth locally" sections) to test schema
  changes against real infrastructure before they ever reach `main`, then a push runs the
  same change through `ampx pipeline-deploy` to production. No new tooling to learn —
  this is the same rhythm every backend change has already used this project.

### Why Reminders first

Of everything currently in `localStorage` (spoons energy level, Reminders, Distract Me's
volume/last sound), Reminders is the only one where *not* syncing across devices is a
real, current limitation someone would notice (a reminder set on your phone should still
warn you on your laptop). The others are low-stakes local preferences with no obvious
value from cross-device sync — not worth the engineering cost until Reminders proves the
pattern out.

## What Phase 1 built (done, verified, on the branch)

- `amplify/auth/resource.ts` — `defineAuth({ loginWith: { email: true } })`.
  Registered in `amplify/backend.ts` alongside `data`/`aiAssistFunction`/
  `logEventFunction`. `amplify/data/resource.ts`'s `defaultAuthorizationMode` is
  untouched (`apiKey`) — auth exists for identity/session only in this phase; nothing is
  gated behind it.
- `src/context/AuthContext.tsx` — reflects Amplify's own persisted session into React
  (same Context+Provider+hook shape as `EnergyContext`/`RemindersContext`): calls
  `getCurrentUser()` on mount, subscribes to `Hub.listen('auth', ...)` for
  `signedIn`/`signedOut` events so state updates the moment the Authenticator completes
  a flow. Exposes `useAuth(): { user, isSignedIn, loading, signOut }`.
- `src/components/AccountButton.tsx` — fixed top-left pill button (mirrors
  `EnergyButton.tsx`'s pattern; top-right is Energy, top-center is the reminder banner,
  bottom-center is the now-playing bar — top-left was the one open corner). Shows
  "Sign in" or the signed-in email; opens the existing `Modal.tsx` containing Amplify
  UI's `<Authenticator>` (signed out) or an account summary + Sign Out button (signed
  in). Rendered unconditionally in `App.tsx` — not a gate around anything.
- Theming: `src/index.css`'s `.amplify-auth-theme` block maps Amplify UI's `--amplify-*`
  tokens onto this app's existing CSS variables, so the Authenticator follows light/dark
  mode automatically (the underlying app tokens already flip; the Authenticator just
  references them — no separate dark-mode block needed).

  **The theming gotcha, worth understanding fully since it'll recur for any future
  Amplify UI theming, not just this one component:** Amplify UI's own stylesheet defines
  most visual properties via a `--amplify-components-*` token, itself typically written
  as `var(--amplify-colors-font-primary)` or similar — a reference to a more general
  token. The instinct is to override just the general tokens once, at the top, and
  expect everything downstream to follow. **That doesn't work**, because a `var()`
  reference inside a CSS custom property declaration is resolved *once, at the element
  where that declaration lives* — and Amplify's own declarations live at `:root`. Since
  this app's override only exists on `.amplify-auth-theme` (a descendant of `:root`),
  the general token still resolves to *Amplify's own default* at `:root`, and that
  already-resolved value is what inherits down — never re-evaluated against this app's
  override further down the tree. Net effect: overriding only the general
  `--amplify-colors-*` tokens silently does nothing for most of what's actually visible,
  which is styled via component-specific tokens.

  This was first hit with the card/tab background (fixed by setting
  `--amplify-components-authenticator-router-background-color` and the matching
  `tabs-*` tokens directly, rather than relying on the general
  `--amplify-colors-background-primary` override), and hit *again*, worse, with the
  actual input text color: a real bug where typed text in the email field rendered as
  dark-navy-on-dark-navy in dark mode, reported directly with a screenshot. That one
  goes through **three layers** of the same pattern before reaching the rendered
  element: `--amplify-components-fieldcontrol-color` is redeclared to
  `--amplify-components-textfield-color`/`-passwordfield-color` right on the field
  wrapper element, which is *itself* redeclared to `--amplify-components-input-color`
  right on the actual `.amplify-input` element — each redeclaration a fresh direct
  assignment that has to be overridden individually, since a direct assignment on a
  descendant always wins over whatever was inherited from an ancestor, regardless of
  that ancestor's specificity. Found by walking the live DOM's computed
  `--amplify-components-fieldcontrol-color` value element-by-element up the ancestor
  chain in an actual dark-mode render (`getComputedStyle(el).getPropertyValue(...)` at
  each level) until the exact element where the value flipped was located — not
  something guessable from Amplify's docs or from reading the CSS alone.

  Hit a third time, again via a direct screenshot report, with the show/hide-password
  eye icon (rendering in Amplify's own dark default, near-invisible on the dark card)
  and the live password-requirements checklist text (a dim, low-contrast red instead of
  this app's `--error` red). This time the twist wasn't extra layers of the *same*
  token — it was that visually adjacent things turned out to be driven by entirely
  *different* token families: the eye icon is re-pointed by `.amplify-passwordfield`
  from the general `button-color` to its own `passwordfield-button-color` (plus a
  further `passwordfield-button-error-color` specifically for the invalid state), and
  the requirements-checklist text isn't a field message at all — it's a plain
  `<p class="amplify-text amplify-text--error">` styled via `text-error-color`, a token
  wholly unrelated to `fieldcontrol-error-color` (the input border) or
  `fieldmessages-error-color` (real field validation messages, e.g. "this field is
  required" — also newly overridden here, having gone unnoticed until now because no
  field had triggered one).

  **The practical rule this leaves behind:** for any Amplify UI element whose color
  needs to follow this app's theme, override the component-specific token directly, and
  verify empirically (computed styles, not just the general token's presence in the
  override block) rather than assuming a general token's override propagates. Don't
  assume that fixing one visual property (e.g. "error red") fixes every element that
  happens to look the same shade of red — each is very possibly its own token, requiring
  its own DOM walk to confirm. The full set of tokens overridden for this reason —
  card/tabs, field text, field labels, headings, body text, three separate error-text
  token families, password-toggle icon (including its error state), button/link text —
  is in `src/index.css`'s `.amplify-auth-theme` block, with this same explanation
  repeated inline there for anyone editing it without this document open.
- New dependency: `@aws-amplify/ui-react`.
- Tests: `src/context/AuthContext.test.tsx` covers the React-state-reflection logic with
  mocked `aws-amplify/auth`/`Hub`. Real Cognito flows aren't unit-testable — verified
  instead against a personal sandbox (`ampx sandbox --identifier authtest`): an
  admin-created confirmed test user (`aws cognito-idp admin-create-user` +
  `admin-set-user-password`, bypassing email verification) drove a full real sign-in →
  session-persists-across-reload → sign-out round trip via Playwright; the real sign-up
  and forgot-password forms were separately driven far enough to confirm each reaches
  Cognito and lands on its "enter the code we emailed you" screen — completing those two
  specific flows needs a real inbox, not available in that pass.
- Full detail and the exact commands used: see `CHANGELOG.md`'s "User accounts, Phase 1"
  entry and `OPERATE.md`'s "Testing auth locally" section.

## What Phase 2 built (done, verified, on the branch)

Gave sign-in an actual purpose: previously nothing read or wrote differently based on
who was signed in. Phase 2 backs the two things that were already the app's only
persisted client state (confirmed by grepping the codebase for `localStorage` before
starting — nothing else persists anything) with real per-user storage.

- **Data model** (`amplify/data/resource.ts`): `Reminder` and `UserPreferences`
  `a.model()`s, both `.authorization((allow) => [allow.owner()])`. `Reminder` mirrors
  the client-side `Reminder` interface (`message`, `fireAt`, `warnBeforeMinutes`,
  `warnedForCurrentFireAt`, `repeat`), keeping `repeat` as a single JSON string field
  (the `RepeatRule` discriminated union) rather than separate columns, per the schema
  evolution strategy above. `UserPreferences` holds one row per user (`spoons` today),
  keyed by the caller's Cognito username so it acts as a singleton rather than a list —
  named for growth, so any future per-user scalar preference has a home without a new
  model each time.
- **`src/lib/dataClient.ts`** (new) — a `generateClient<Schema>({ authMode: 'userPool'
  })`, separate from `aiClient.ts`/`usageLog.ts`'s own clients. This turned out to be
  load-bearing, not a style choice: the schema's `defaultAuthorizationMode` is
  `'apiKey'` (so `runAiTool`/`logEvent` need no per-call override), but
  `Reminder`/`UserPreferences` only permit `allow.owner()`. A client call against them
  without an explicit `userPool` authMode is rejected server-side with "Not Authorized"
  — this doesn't show up in unit tests (the client is mocked) or in casual manual
  testing (errors are caught and only logged to the console), and was only caught by
  scanning the actual DynamoDB tables directly during sandbox verification and seeing
  them empty despite the UI appearing to work. Worth remembering for any future
  owner-scoped model: **the generated client's default authMode is the schema's
  `defaultAuthorizationMode`, not whatever a specific model's own authorization rule
  requires** — it has to be set explicitly, either per-client (as done here) or per-call.
- **`RemindersContext` rework**: signed-out behavior is untouched. Signed-in state is
  driven by `client.models.Reminder.observeQuery()` — Amplify Data's built-in pattern
  that emits the current items immediately and live-updates after, which is what makes
  "created on phone, appears on laptop" work without any manual refetch/polling.
  `addReminder`/`cancelReminder` write through `create()`/`delete()`, updating local
  state optimistically first (same instant feel as before this context talked to a
  backend) and letting the next `observeQuery` emission reconcile. The existing
  `checkReminders()` firing loop (15-second interval, catch-up-on-mount) is unchanged;
  it now also calls `update()`/`delete()` for whichever reminders it advances or drops,
  when signed in, so a repeating reminder's next `fireAt` and a fired one-shot's removal
  actually stick server-side instead of reverting on the next sync.
  - **First-login migration**: resolved as *silent automatic merge* (asked the user
    explicitly — the alternative considered was a one-time "bring N local reminders
    into your account?" confirmation dialog, rejected as an unnecessary interruption
    that cuts against this app's no-friction philosophy). Implemented as: first time
    `isSignedIn` flips true on a device and a `beths-gang:reminders-migrated` flag isn't
    set, upload every local reminder using its existing id (so a duplicate run just
    fails the `create()` harmlessly rather than double-uploading), then set the flag.
  - **Sign-out must hide account data, not carry it into the local view** — this went
    through a wrong first attempt worth recording, found via direct user testing (not
    caught by any automated test): the first version made the localStorage-persistence
    effect unconditional, on the theory that "whatever `observeQuery` last delivered is
    already sitting in localStorage by sign-out time, so the signed-out fallback
    resumes from synced state instead of stale pre-sign-in data." That reasoning missed
    the actual requirement — this is a personal-scale app but the data is still
    account-scoped, and a reminder created while signed in stayed fully visible
    immediately after signing out, on the same device, with no account attached. Fixed
    by never writing to localStorage while signed in at all, and reverting `reminders`
    to whatever localStorage actually holds (untouched by the signed-in session) the
    moment `isSignedIn` flips false. Getting this right took two attempts even after
    the requirement was clear: a first fix used two separate effects (one to mirror
    signed-out state to localStorage, one to revert on sign-out), which reintroduced
    the bug via a subtler bug — both effects fire in the *same* render on the sign-out
    transition, and the mirroring effect still sees that render's stale,
    still-signed-in `reminders` value (React doesn't re-run a sibling effect
    mid-flush after another effect's `setState`), so it wrote the account's data to
    localStorage a moment before the revert effect read it back out. Fixed for real by
    merging both concerns into one effect, so there's a single code path per render
    instead of a race between two. Verified live end-to-end: sign in, add a reminder
    (visible), sign out (reminder gone, "No reminders set yet."), sign back in (reminder
    reappears) — while a direct DynamoDB scan confirmed the row was never deleted
    server-side throughout, only ever hidden from the local, unauthenticated view.
  - **Conflict resolution**: still last-write-wins (DynamoDB's default), still not
    designed further — see "Open risks" below. Not hit in practice yet since this is a
    single-user personal tool, but worth knowing before recommending multi-device
    simultaneous editing as a feature.
- **`EnergyContext` rework**: same signed-out/signed-in split, and the same
  never-write-to-localStorage-while-signed-in fix as `RemindersContext` above (applied
  at the same time, once the pattern was clear) — an account's Spoons value doesn't
  persist locally past sign-out either. On first `observeQuery` emission: no
  `UserPreferences` row yet means a brand-new account, so `create()` one seeded from
  whatever's currently on the device; a row already existing means a returning user,
  whose cross-device value wins over this device's local one (verified live: a device
  with a stale local value of 10 adopted the backend's 90 on sign-in without asking).
  `setSpoons` calls `update()`, falling back to `create()` if that fails (handles the
  race where the slider moves before the sign-in reconciliation above has finished
  creating the row). Simpler to get right than Reminders' fix, since Spoons has no
  background effect mirroring state on every render — the write only ever happens
  synchronously inside `setSpoons` itself, gated on `!isSignedIn`, so there was no
  equivalent race to find.
- Tests: `RemindersContext.test.tsx` and the new `EnergyContext.test.tsx` mock
  `aws-amplify/data`'s `generateClient` and `useAuth` to cover both signed-in and
  signed-out branches, including migration and its idempotency on a second sign-in, and
  the create-vs-adopt singleton logic. `src/tools/remindMe/index.test.tsx` needed its
  test wrapper updated too, once `RemindersProvider` started calling `useAuth()`
  internally — any test that mounts `RemindersProvider`/`EnergyProvider` now needs an
  `AuthProvider` ancestor (with `aws-amplify/auth`/`aws-amplify/utils` mocked), the same
  way `AuthContext.test.tsx` already did.
- Real verification against a live sandbox (`ampx sandbox --identifier authtest`):
  signed in as an admin-created test user via Playwright, added a reminder and moved
  the Spoons slider, confirmed both directly in DynamoDB (not just in the UI — the
  authMode bug above would have looked identical to success in the UI alone, since
  optimistic local state and `localStorage` both make signed-out-style behavior look
  fine even when every backend write is silently failing), confirmed both survive a
  real page reload, confirmed sign-out falls back to synced `localStorage` correctly,
  and confirmed a second device with a pre-existing local reminder migrates and merges
  it on sign-in without duplicating anything already in the account.

## What's still to do (Phase 3+, not designed yet, just noted)

- Expand personalization to other state, now that `UserPreferences` exists as a home for
  it: Distract Me's last sound/volume is the next obvious candidate, though it isn't
  currently persisted at all (checked — it resets every session by design today), so
  this would be a new feature (add persistence, then make it per-user) rather than a
  migration of existing behavior.
- Action-level usage-logging events tied to a signed-in identity (currently
  `src/lib/usageLog.ts` logs are anonymous — see `TODO.md`'s "Action-level usage events
  for non-AI tools" for the related, separate idea of richer event *types*, which is
  orthogonal to whether events are tied to a user).
- A real loading state for the initial `observeQuery` fetch — right now the UI shows
  whatever's in local/optimistic state until the first backend emission arrives, which
  is fine at this app's scale (the sandbox verification's round-trips were all
  sub-second) but isn't a designed "loading" affordance.

## Open risks / things to watch

- **Cognito's default email sender has a low daily quota** — fine for personal-scale
  use and this phase's testing, but worth knowing before any wider rollout; the fix
  (if ever needed) is configuring SES, not something set up yet.
- **No conflict resolution beyond DynamoDB's default last-write-wins** for the same
  reminder or preference edited on two devices simultaneously — an accepted limitation
  for a single-user personal tool, not a gap to close before this ships, but worth
  revisiting if this app ever needs to support genuinely concurrent multi-device editing
  (e.g. shared/family accounts).
- **The client authMode gotcha** (see "What Phase 2 built" above) generalizes beyond
  this one client: any future owner-scoped model needs its client calls to explicitly
  request `userPool` auth, and the failure mode (silent, UI looks fine, only the
  DynamoDB table is actually empty) doesn't surface without checking the actual backend
  state — worth remembering as a first check for "this looks like it's working but I'm
  not 100% sure" on any future Amplify Data model.
- **Don't run a second `ampx sandbox --identifier <name>` "for isolation"** — this
  actually happened during Phase 2 development: an `authtest`-identified sandbox
  (created for Phase 1's auth testing, reasonably enough at the time) ended up coexisting
  with the default `<your-username>`-identified one `runLocal.sh` creates, both picking
  up the same schema changes independently. Two live Cognito pools + DynamoDB tables +
  AppSync APIs, and testing against the "wrong" one from a second browser looked exactly
  like a cross-device sync bug until the two separate CloudFormation stacks were found.
  Resolved by deleting `authtest` (`npx ampx sandbox delete --identifier authtest`) and
  standardizing on the one default sandbox going forward — see `OPERATE.md`'s "Testing
  auth locally" section, updated with this same warning.
- **Merging this branch to `main` is a separate, explicit step** — not done as part of
  building Phase 1 or Phase 2, per this project's standing git discipline (nothing gets
  pushed or merged without being asked).
