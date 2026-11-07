# Dashboard password recovery — local acceptance

7 November 2026. Implemented on current `main` checkout, source parent
`cf831c1877475b9b1e7c0e9a5be94ddb9d1fce5c`. No worktree, branch switch,
push, deployment, provider change, real email or real credential reset.

## Delivered

- Normal password login now links **Forgot password?** to `/forgot-password`.
- Request email → private reset link → new/confirmed password → sign-in return.
- Shared AuthShell, Field/Input/SubmitButton/FormFeedback and Warm Desk email.
- Existing Better Auth 1.6.23 and Prisma adapter own token generation,
  15-minute expiry, hashed identifier storage, atomic single consumption,
  password hashing and session revocation. The dashboard wraps installed reset
  calls in one bounded outer transaction, including rollback on revocation failure.
- Same configured HTTPS dashboard Origin and JSON required. Email URLs use
  server configuration, never Host or client redirect input. Token fragment is
  removed into component memory; pages/responses have no-store/no-referrer.
- Account lookup and managed QA/Resend delivery run inside Next `after`, after
  the same generic response for known and unknown addresses. Existing atomic
  HMAC rate buckets limit email/network attempts without storing those identities.
- Invalid, expired, used and missing tokens; mismatched passwords; request limits;
  delivery failures; network retry; same-tab link reopening; and ordinary sign-in
  remain explicit paths. Passwords/tokens are excluded from assistant tools.

## Verification

| Check | Result |
| --- | --- |
| `qa:doctor --offline` | Pass; profile isolation/dependencies/client presence |
| `qa:doctor --services api,dashboard` | Pass; existing local runtimes reused |
| Recovery integration (`apps/dashboard/src/lib/password-recovery.test.ts`) | 8 tests, 68 assertions; actual installed SDK/Prisma adapter and hashing, inert persistence and email boundaries |
| Middleware + actual email renderer | 18 tests, 169 assertions |
| Existing dashboard login route | 6 tests, 23 assertions |
| Existing shared auth/session admission | 12 tests, 46 assertions |
| Focused source smoke, 16 explicitly owned paths | 259 tests, 1,679 assertions across 53 files; QA tooling types/Biome pass; no unsupported mappings |
| Dashboard, Auth and Email TypeScript | Pass; Dashboard required `NODE_OPTIONS=--max-old-space-size=8192` after default-heap exhaustion |
| H01 | Current snapshot; no capability/procedure changes |
| H02 | Pass, recovery impact record; deterministic authentication excluded from assistant |
| Actual local recovery pages in Chromium | Request/generic result, 429, missing link, mismatch with no submission, token removal, reset success, invalid link, network retry and sign-in return pass; zero page errors |
| Actual running POST route rejection | Same-origin malformed request/reset400; foreign-origin403, no DB/mail effect |
| Canonical existing-data web smoke | Pass: QA selection, populated Catalog, draft total, Cancel without submitting |

Focused tests total **44 tests / 306 assertions** in separate processes to avoid
mock contamination. Recovery transaction/concurrency tests use inert persistence;
no live PostgreSQL or hosted mail acceptance is claimed. UI recovery POSTs were
intercepted in Chromium and assert their real client payloads; server behavior is
covered separately by the SDK/adapter integration. No false claim of a live email
or real-user credential change.

Canonical local receipt `3e90650e-82d5-474f-b159-2f0e9d17ea96`,
17:28:58.493Z–17:29:18.390Z, source parent above plus the unchanged relevant dirty
source. `clean:false`, `runtimeVerified:false`: development acceptance only,
never a qualified Preview/Production release receipt. Initial Chromium launches
hit sandbox Mach-port restrictions and passed after approved external execution.
One earlier smoke completed all actions but was invalidated by the concurrent
Android commit; the recorded final run is the bounded retry with stable source.

Private artifacts: `/tmp/password-recovery-ui/{result.json,success.png}`;
existing canonical receipt/artifacts remain under `.scratch/qa-release/`.
No private captures or test configuration are committed.

## Configuration and remaining release boundary

The merged local `.env` + `.env.production` profile contains Resend key, sender,
auth secret, `EMAIL_DELIVERY_MODE=live`, no capture file and dashboard origin
`dash.ewatrade.com`. No missing local production-profile setting was found.
These are presence/safe-value checks only: deployed **Dashboard** environment,
Resend sender verification and actual delivery were not inspected or changed.
The configured API sender alone is insufficient proof for Dashboard. Preview's
release recipe currently excludes mail/URL settings from required environment
checks; inspect the selected target before a separately authorized mail canary.

Post-response delivery is platform-managed `after` work, not a durable retry
queue. A failed send leaves a generic public response and a content-free failure
log; the user can request again within the budget. Existing transport preserves
QA routing and Production fail-closed behavior. No new provider setting is needed
by the code beyond the existing mail/auth/dashboard configuration.

No Prisma change, migration or database push. Brain documentation is intentionally
local-only and was not force-added: feature, ADR, API contracts/permissions,
schema-reuse note, BRAIN pointer and task-state pointer. The tracked H02 record
points to these files. Apple/Android product, pricing and release docs were not
edited by this task.

Implementation reference: [Better Auth email/password documentation](https://better-auth.com/docs/authentication/email-password), cross-checked against the installed
1.6.23 source rather than assuming newer documentation's transaction semantics.
