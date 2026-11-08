# Transactional Email via SES — Design / Work Plan

**Status:** NOT STARTED. Planned 2026-09-02, paused before implementation (time-constrained).
This document is the pick-up point. Resume at "Open decisions" once there's time.

See `designs/user-personalization.md` for the auth design this extends, and
`designs/usage-logging.md` for how we know the current user base is tiny.

## Motivation

The app's opt-in Cognito email/password auth (see `designs/user-personalization.md`) sends
verification and password-reset codes through Cognito's built-in sender
(`EmailConfiguration.EmailSendingAccount: COGNITO_DEFAULT`). That sender:

- sends from `no-reply@verificationemail.com` — no SPF/DKIM/DMARC alignment with anything we
  control, so Gmail and others spam-filter or silently drop it;
- is capped at ~50 emails/day;
- gives zero delivery visibility (no bounce/complaint feedback).

Concrete failure: on 2026-09-01 the project owner tried to register `scottejames@gmail.com`
and the code never arrived. The account was created but stuck `UNCONFIRMED`. Two earlier
sign-ups happened to get through; this one did not. If the app picks up more users, sign-up
is currently a coin flip.

**Intended outcome:** verification / reset emails sent from a domain we own, DKIM-signed and
DMARC-aligned, reliably landing in the inbox — so registration is dependable.

## Current state (gathered 2026-09-01/02 — region `eu-west-2`, account `099102031252`)

| Thing | Value |
|---|---|
| Amplify app | `BethsGang`, appId `dk3ifbty6lizq`, branch `main` |
| App URL | `dk3ifbty6lizq.amplifyapp.com` (no custom domain) |
| Prod auth CFN stack | `amplify-dk3ifbty6lizq-main-branch-be5eac8cbe-auth179371D7-IAO37JWSN4O8` |
| Prod user pool | `eu-west-2_uNz2kwRg7` |
| Prod user pool app client | `1kba9cu87sfm807k18914ab4jr` (no client secret) |
| Prod identity pool | `eu-west-2:c6e9a004-1130-499e-aee9-2402685ca86d` |
| Prod pool users | 3: Bethany (confirmed), verve94 (confirmed), scottejames@gmail.com (UNCONFIRMED) |
| SES (eu-west-2) | Sandbox (`ProductionAccessEnabled: false`), sending enabled, 200/day @ 1/s, **no identities** |
| Route 53 | No hosted zones. No evidence the user owns any domain. |
| Amplify libs | `@aws-amplify/backend` ^1.23.0 (supports `senders.email`), `backend-cli` ^1.8.3 |

`amplify/auth/resource.ts` today:
```ts
export const auth = defineAuth({
  loginWith: { email: true },
});
```
`amplify/backend.ts` wires `auth`, `data`, `aiAssistFunction`, `logEventFunction`.

Unrelated aside noticed during this work: the repo's committed `amplify_outputs.json` points
at the owner's personal **sandbox** pool (`eu-west-2_m0DQhwx6d`), not prod.

## Immediate workaround (independent of this plan — safe to do any time)

Unblock the owner's own stuck account without waiting for the email fix:
```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id eu-west-2_uNz2kwRg7 --username scottejames@gmail.com --region eu-west-2
aws cognito-idp admin-update-user-attributes \
  --user-pool-id eu-west-2_uNz2kwRg7 --username scottejames@gmail.com --region eu-west-2 \
  --user-attributes Name=email_verified,Value=true
```
Reversible with `admin-delete-user`. Does not fix the underlying email problem.

## Open decisions (resolve first when resuming)

1. **Domain to register.** User chose "register a new domain". Still to pick:
   - Name / TLD — e.g. `bethsgang.app` (forces HTTPS, ~£12/yr), `bethsgang.com`, other.
   - Registrar — **Route 53** recommended (auto hosted zone, one-click SES DKIM records)
     vs external registrar (then delegate DNS to Route 53 or add records manually).
2. **Point the app at the domain too?** Optional, while DNS is being set up: associate
   `bethsgang.app` / `www` with the Amplify app so the app URL matches the sender domain.
   Can be deferred to a separate job.
3. **SES production access.** Sandbox only sends to individually-verified recipients — real
   strangers still get nothing. Getting out is a free AWS Support request (~24h). Decide:
   request now, or stay sandboxed while users are just known testers.
4. **From address & sender name.** e.g. `no-reply@bethsgang.app`, display `Beth's Gang`,
   optional `replyTo` pointing at a real inbox.
5. **Custom email copy?** Optional. Default is "The verification code to your new account is
   {####}". Customising needs a CDK escape-hatch (step 6).

## Implementation steps

### 1. Register the domain
Route 53 `register-domain` (or console) — creates a hosted zone automatically. Record the
hosted zone ID in `~/Notes/Journal/ComputerUpdates/`.

### 2. Verify the domain as an SES identity (must be region `eu-west-2`)
- `aws sesv2 create-email-identity --email-identity bethsgang.app --region eu-west-2` with
  Easy DKIM.
- Publish the 3 DKIM `CNAME` records to the hosted zone (Route 53 domains → console offers
  one-click; via CLI, build them from `get-email-identity`).
- Wait for `VerifiedForSendingStatus: true` and `DkimAttributes.Status: SUCCESS`.
- Add DMARC TXT: `_dmarc.bethsgang.app` → `v=DMARC1; p=none; rua=mailto:<inbox>`
  (start `p=none`, tighten later).
- Optional: custom MAIL FROM domain (`mail.bethsgang.app`) for SPF alignment —
  `put-email-identity-mail-from-attributes` + its MX/TXT records.

### 3. (If decided) Request SES production access
Support console / `put-account-details`: use case = transactional auth emails for a personal
ADHD-productivity web app, volume <200/day, plus the bounce/complaint handling from step 4.

### 4. (Optional but strengthens step 3) Bounce / complaint handling
SNS topic + owner subscription; SES configuration set with a
`BOUNCE`/`COMPLAINT` event destination; set it as the identity's default config set.

### 5. Wire SES into Amplify auth — `amplify/auth/resource.ts`
```ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: { email: true },
  senders: {
    email: {
      fromEmail: 'no-reply@bethsgang.app',  // must be a verified SES identity in eu-west-2
      fromName: "Beth's Gang",
      // replyTo: 'hello@bethsgang.app',
    },
  },
});
```
Also rewrite the file's top comment (currently explains the COGNITO_DEFAULT choice).
`senders.email` makes Amplify point the pool at SES (`DEVELOPER` sending + the identity's
SourceArn). It does **not** create the identity — step 2 must be done first, same region.

### 6. (Optional) Customise the verification email copy
No first-class field in `defineAuth`. CDK override in `amplify/backend.ts`:
```ts
const backend = defineBackend({ ... });
const cfnUserPool = backend.auth.resources.cfnResources.cfnUserPool;
cfnUserPool.verificationMessageTemplate = {
  defaultEmailOption: 'CONFIRM_WITH_CODE',
  emailSubject: "Your Beth's Gang verification code",
  emailMessage: 'Your code is {####}',
};
```

### 7. Test on a personal sandbox first
`npx ampx sandbox` — its auth stack picks up `senders.email`; the SES identity is
account-wide so `bethsgang.app` works for sandbox and prod alike. While SES is still in
sandbox mode, also verify the test recipient address or the send fails.

### 8. Deploy to prod
Commit `amplify/auth/resource.ts` (+ `backend.ts` if step 6). Push to `main` **only after an
explicit go-ahead** (per repo convention). Amplify runs `ampx pipeline-deploy` then the
frontend build. Watch:
```bash
aws amplify list-jobs --app-id dk3ifbty6lizq --branch-name main
```
Then confirm the pool changed:
```bash
aws cognito-idp describe-user-pool --user-pool-id eu-west-2_uNz2kwRg7 --region eu-west-2 \
  --query "UserPool.EmailConfiguration"
# expect EmailSendingAccount: DEVELOPER, From: no-reply@bethsgang.app, SourceArn present
```

### 9. Update project artifacts (run the `update-project-artifacts` skill)
- `README.md` — Auth / Secrets area: SES-backed email, the verified domain, the
  same-region coupling gotcha.
- `OPERATE.md` — the Auth testing section currently states Cognito default sender + low
  quota; update, and add how to check SES identity health / where bounce alerts go.
- `CHANGELOG.md` — entry for the switch.
- `designs/user-personalization.md` — cross-link and a short note on the decision.
- `~/Notes/Journal/ComputerUpdates/` — new file: domain registration, hosted zone ID, SES
  identity, DNS records, production-access ticket reference.
- `npm run verify` before pushing.

## Verification (end to end)

1. `describe-user-pool` → `EmailConfiguration.EmailSendingAccount: DEVELOPER` with the
   `bethsgang.app` From address.
2. `aws sesv2 get-email-identity --email-identity bethsgang.app --region eu-west-2` →
   `VerifiedForSendingStatus: true`, DKIM `SUCCESS`.
3. Fresh registration at `dk3ifbty6lizq.amplifyapp.com` (real external address if production
   access granted, else a pre-verified one): code arrives in the inbox — not spam — within
   ~1 min, From `Beth's Gang <no-reply@bethsgang.app>`. Confirm + sign in.
4. "Forgot your password?" also delivers a code.
5. Gmail "Show original" → SPF, DKIM, DMARC all PASS.
6. `admin-delete-user` the throwaway test accounts.

## Rollback

Revert `amplify/auth/resource.ts` to the minimal `defineAuth({ loginWith: { email: true } })`
and redeploy — the pool falls back to `COGNITO_DEFAULT`. The SES identity and domain can be
left in place (no cost beyond domain renewal) or torn down.
