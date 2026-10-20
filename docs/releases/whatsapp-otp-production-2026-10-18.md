# WhatsApp phone-authentication production candidate — 18 October 2026

## Main consolidation and priority — 19 October 2026

Continue from the primary `main` checkout. The owner-directed checkpoint
`ff267716` commits current shared implementation, and merge `799a7b43` incorporates
OTP candidate `8293e2c4` while retaining the newer full WhatsApp platform handler,
shared auth/privacy features and larger typography. The OTP managed worktree is
archived. No push, deployment or fresh tests/build were performed; the earlier
candidate checks below do not establish acceptance of the full merged source.

Prioritize the combined API, matching functional client, phone-only deletion and
controlled rollout/signup/sign-in. Keep basic delivery/failure visibility and a
compatible rollback. Advanced monitoring, display-name follow-up and credential
renewal are secondary implementation work (renew before 13 December 2026).
Shared Store safety and platform/privacy release work can be handled separately
from OTP implementation, but the existing publication gate remains in force.
Public OTP delivery is not activated by this commit.

The older rollback paragraph below is historical: after phone-only users exist,
retain compatible deletion/contact API support when disabling OTP delivery. Do
not promote an older incompatible API solely because it was the old baseline.

This scoped candidate starts from deployed API source 931cbfc0388a91a8a3e6061848ccaf7d954c48b2. It includes the reviewed phone-only deletion implementation and matching native screens from ea40a1da336fefc438d5320aca70a213ede28b85. Existing email identities are preserved; an unverified phone on an email account cannot be claimed by phone signup.

## Verified

- Real received-code Development signup and same-account sign-in passed owner-operated script on 18 October; code replay refused.
- Focused candidate API/query/transport suite: 28 tests, 180 assertions, no failures.
- Read-only Production schema check: all required phone authentication and privacy columns present; no schema change or database migration.
- Production API project has the approved sender/template and a sensitive token; delivery flag remains false. The current token expires 13 December 2026 at 18:08:22 UTC and must be renewed beforehand.
- Approved existing square EwaTrade logo uploaded to the WhatsApp sender; profile read-back confirms a photo is set.

## Release constraints

- Production mobile store/OTA readiness script currently fails its existing chat eligibility, legal, media/classification and exact signed-client acceptance gate. Do not bypass it.
- Current Android internal build 33 does not contain the phone deletion contact screen. Publishing a compatible client is required before phone authentication is enabled for its users.
- Owner's approved recipient ending 7306 is already associated with a verified-email Production account and has an unverified phone. Never merge, replace or mark it verified through the new-signup path. A separate owner-approved WhatsApp recipient is needed for a Production signup test.
- No Production signup, OTP send, deployment, mobile publication or activation is claimed by this source packet. Deployment/acceptance receipts must be recorded separately.

## Rollback

Keep WHATSAPP_OTP_ENABLED=false until compatible-client and Production received-code acceptance. The previously READY API deployment is dpl_8DVDUGUGd5PnwUiqmQrmAdBNG2PH. API rollback is an independently verified promotion of that exact owned deployment; no database rollback is required by this patch.

## Owner-approved existing-account verification continuation

Both approved personal test phones already belong to existing verified-email Production accounts with unverified phone fields. Owner chose one-time verification from the signed-in account followed by normal phone+WhatsApp-code login. New accountPhoneStatus/requestAccountPhoneOtp/verifyAccountPhoneOtp require genuine fresh persisted non-QA session, verified current email/current attached phone and no active privacy closure. No caller phone/user selector, reassignment, email rewrite or merge. Session/user/phone HMAC-bound five-minute challenge, five attempts, shared send budgets plus actor budget; consume and conditional phoneVerifiedAt update are atomic. Phone linking does not issue another session. Matching native Account/privacy screen added; signup still refuses existing accounts.

Focused combined suite58tests/305assertions passes. Repeatable `bun qa:account-phone-verification` uses actual app.fetch/auth context and guarded Neon Development with only Meta stubbed; exactly one winner in duplicate simultaneous verification, same-user ordinary phone login and genuine new Session, identity preservation, replay refusal and exact fixture cleanup all pass. No real provider sends or Production changes. Global/network shared budgets are preserved during cleanup. Full strict API compile remains pending after8GiB exhaustion; this is not release acceptance. Public client release remains held by the existing gate.
