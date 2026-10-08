# EwaTrade iOS release implementation — 7 October 2026

The requested four-step release remains unfinished. Preparation is 3/6 (50%);
release acceptance is 0/4: deletion and chat safety in progress, signed iOS and
submission pending. HalaalVest remains saved until EwaTrade is ready.

Implementation is isolated on `codex/ewatrade-ios-release-20261007`, based on
`3dcab47bee60b84d75035be862be85730395322e`. No Production configuration, database,
deployment, email delivery, completed iOS binary, EAS update, TestFlight upload or
submission is claimed by this implementation record. A guarded Preview build
attempt is recorded below. Concurrent main mobile changes are preserved.

## Prepared source

- Platform-admin-only `accountPrivacy.processProfile` accepts only requestId;
  operator identity and exact approved policy are server-derived.
- Profile minimization requires both processing flags, exact SHA-256-bound policy,
  verified account/contact provenance, access revocation and seven prior domain
  outcomes. Serializable transaction uses fresh bounded options.
- It clears profile names/contact/avatar/metadata/age declarations, authentication
  accounts including password hashes, sessions and matching mobile verification
  records. Receipt ERASE/RETAIN is explicit; the approved operating choice is RETAIN.
- The surviving pseudonymous User provides business/audit linkage. The outcome is
  RETENTION_APPROVED with policy-bound evidence and a review date. Neither full
  erasure nor anonymous data is claimed. Current state and evidence are rechecked
  on replay and final completion, including age declarations.
- A fresh external email OTP can recover one proven original processing/completed
  request after minimization. Ambiguity, stale evidence, wrong subject and residual
  fields refuse. A newly registered email takes precedence. Public output is only
  request status/dates; immutable contact and subject are never reassigned.
- Five additional direct-attribution inventories (assistant conversations/runs, legacy
  messages, automation events and product analytics) now block minimization and
  completion while records lack their own reviewed disposition. Counts only are
  queried; message/event payloads are not read.
- Existing OpenAI adapter from `b83768fb` is integrated. Pinned snapshot
  `omni-moderation-2024-09-26`, all 13 category flags required, any flag rejects,
  redirects/errors/malformed/oversized responses fail closed, 8-second gate retained.
  Production also requires an explicit approval reference and key. QA fixtures
  remain unavailable to Production, including a missing/unknown profile there.
- Legal preflight recognizes visible React text boundaries while rejecting a version
  present only in an HTML comment. The obsolete draft-version test now names an
  actual unpublished version; legal acceptance authority is unchanged.

## Accepted operating decisions

Owner approved OpenAI text moderation, 24-month minimal acceptance/deletion evidence,
12-month necessity review, 90-day identifying contact-data removal after completion,
and Ishaq Yusuf as initial privacy/abuse lead. The companion policy records purposes,
exceptions and proposed response targets. Recommended backup: a trusted operations/customer-support teammate with individual
access and MFA. No person is assigned; the backup name and coverage exercise remain pending.

The current profile processor does not implement the 90-day/24-month retention
lifecycle. Positive-data merchant/conversation/subscription/clinical/provider outcomes,
provider reconciliation, exact result notice approval and real sender/webhook
acceptance remain required. An approved policy or unit pass must not enable intake
before these operational requirements are complete.

## Verification

- Current account-privacy unit suite: 268 pass, 8 database tests skipped, 0 fail;
  755 assertions across 23 files. Includes the five additional-attribution guards.
- Moderation/provider and legal-preflight suite: 24 pass, 139 assertions across
  2 files. All 21 changed TypeScript files pass Biome; scoped TypeScript passed
  again after the fixture schema preflight change.
- API authorization, notice sender and signed Resend webhook suite: 28 tests,
  61 assertions, 3 files pass using the verified Development environment loader.
  Sender/webhook fixtures do not prove actual result delivery.
- Scoped TypeScript against actual generated Prisma types passes for the profile
  policy/processor, completion, retry and integration fixture source. Service
  Commerce package typing passes; changed TypeScript files pass Biome.
- Synthetic live OpenAI calls: five/five expected decisions, all 13 categories,
  HTTP 200 and the pinned model. Four ordinary catalog descriptions allowed;
  threat rejected. Latencies 594–1667 ms. No customer text transmitted.
- Earlier guarded Neon profile/retry fixture: 2 pass, 28 assertions. Seven prior
  outcomes were explicit QA seeds, not full domain processing or end-to-end deletion.
- Latest expanded fixture: 0 pass, 2 fail because Development lacks
  `ProductAnalyticsEvent`. A read-only table check at 2026-10-07T20:43:27Z confirms
  that the other four additional-inventory tables exist. Source declares analytics
  but has no corresponding generated migration. Concurrent assistant schema and
  lead-capture migration work must be reconciled before any full schema push.
- All rows left by that failed fixture were cleaned by exact owned IDs: two requests
  and six synthetic users removed; zero remaining. Production untouched. The
  fixture now checks required tables before its first write.
- Connected founders inbox contains receipt/admin notification for the existing
  synthetic reviewer request. Approval, password setup and signed login remain
  unverified. No invitation token, OTP or password belongs in this record.

No Prisma schema changed in this packet and no migration/schema push was executed.
Deployment requires a compatible schema; absence must never be interpreted as zero
personal records. No whole-repository compile pass or signed-client acceptance is inferred.

## Remaining four-step acceptance

1. Deletion: implement approved expiry/review lifecycle and positive-data domain
   outcomes; configure real result delivery and verified webhooks; ordinary/staff/
   sole-owner/Apple-linked acceptance; activate/test public intake only afterward.
2. Safety: hosted provider activation and truthful privacy disclosure; real report/
   block/response acceptance; media screening/storage and worldwide 13+ regional
   age/consent evidence; replace the unconditional shared audience stop with
   platform-specific verified evidence without dropping existing scope.
3. iOS: clean reviewed commit, isolated Preview origins/signing, candidate build,
   exact-team/bundle/privacy/permission validation, signed login/deletion/chat and
   genuine EAS Update receipt/recovery. Production guard still prevents publication.
4. Store: screenshots from the accepted candidate; reviewer access and inbox/password
   acceptance; privacy/age/rights/review answers; TestFlight upload then submission.

The source app-owned privacy manifest already declares linked functionality data:
name/email/phone/address/other data; user/device identifiers; payment/financial/
purchase data; text, photos/video/audio and other user content, with tracking false.
This is an inventory starting point, not final App Privacy certification. Inspect
actual SDK collection, reachability and Xcode privacy report from the exact build.

## EAS association

`@cipron-startups/ewatrade`, project `532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b`,
Preview/Production channels and fingerprint runtime policy are already configured.
Guarded commands remain `bun run eas:build --preview --platform ios --expected-commit
<FULL_SHA>` and `bun run eas:update --preview --platform ios`. Compatible JS/assets
can update OTA; native SDK/permission changes require a new binary. The guarded Preview build was attempted at source `c9927cbd0023ad63bb5d2ccb3f23bfdba4f0cc88`.
Expo's live Preview environment attachment check passed in an isolated session
as ishaqyusuf. Preview Sentry opt-in flag is absent, and the build profile forces
Sentry off. EAS initialized the Preview iOS build number to1, then exited1 because
no internal-distribution credentials are configured. No binary or successful
build exists from this attempt; Production signing credentials do not establish
Preview internal-distribution readiness. The Preview identity/host check-only
command also passed before the attempt. No EAS Update was published.


## Published review packet and owner handoff

Draft PR [#57](https://github.com/ishaqyusuf/ewatrade/pull/57), source `c9927cbd`, is
published and attached to this task. Vercel Preview builds were triggered by the
branch push; All three Vercel Preview checks (API, Dashboard, Marketing) succeeded for source
commit c9927cbd. Documentation follow-up is published at8f8c623f; those earlier
checks do not certify a later head. This is not Production deployment or end-to-end acceptance.

The owner clarified that no Production account exists and will create one with
his company email through ordinary signup and email verification. Exact email
spelling is not confirmed in text and must not be guessed. The browser handoff is
now at the public Request early access form; Production registration requires an
approved private setup link. No new request was submitted, no password/Terms step
was completed and no account access is claimed. The earlier founders-address
synthetic request remains historical; do not treat it as an existing account.
New passwords must be entered by the owner in the private setup flow, never in chat.
See the companion iOS privacy/reviewer packet for source inventory and actual
signed-build evidence still needed.
