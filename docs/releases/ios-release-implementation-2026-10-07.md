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

## Deletion retention implemented and Development verified — 9 October 2026

Preparation remains **3/6 (50%)**; release acceptance remains **0/4**, steps 1–2
in progress and 3–4 pending. This update supersedes the missing-table blocker and
“expiry implementation pending” observations above.

Current remote main 9c17f56f is merged into the isolated release branch (8bc298f3).
The moderation adapter/approval gate from assistant PR56 is already in main; no
duplicate provider activation is required. The inherited CLI-help assertion was
corrected. Concurrent changes in the primary checkout remain untouched.

`AccountPrivacyRetention` now binds completed requests to an exact approved policy
digest and deadlines calculated from completion: contact cleanup after 90 days,
necessity review at 12 calendar months, receipt/deletion-evidence expiry at 24
calendar months. Leap days clamp to the target month's last day. Completion creates
its retention row atomically and refuses absent/mismatched retention approval.
At 90 days, identifying contact/outcome data, recipient digest and provider lookup
identifiers are cleared. At expiry, request-scoped notices/outcomes/access evidence
and receipts accepted on or before completion are removed; later receipts and
pseudonymous User/business linkage are preserved. This is not full anonymization.

Platform-admin review rereads authority in a fresh transaction; a documented hold
has a named operator and review date no more than 90 days ahead. A hold stops
applying at that date unless renewed. Reviews do not restart the expiry clock.
A bounded daily job shares the existing daily cadence and logs counts of failures
or due reviews. Production flags remain disabled; no inbox email was sent.
Policy changes require deliberate reconciliation of existing digest-bound rows;
this processor refuses a different currently approved policy rather than guessing.
After contact expiry, historical OTP lookup and old completion/delivery-proof
rechecks are unavailable; they cannot silently reidentify an expired contact.

Remote main lacks the newer sales-rep fields already applied to shared Development.
A direct schema push would drop them. An isolated rollout overlay preserved the
exact committed ecf42196 fields/index and its generated migration history. Fresh
read-only diff showed only two new tables plus their indexes/FKs. Guarded root
`db:migrate --local` generated/applied
`20261009083444_account_privacy_retention_and_analytics`; guarded root
`db:push --local` then reported in sync. The exact generated additive migration is
copied into the release branch. No hand-written SQL, reset or data-loss bypass.
Development only; Preview/Production schema rollout remains separate.

Validation: 334 unit/API/job checks pass, 9 integration cases skip in the unit run,
1,024 assertions. EAS wrapper checks: 51 pass, 312 assertions. Scoped generated-client
TypeScript passes. Live guarded retention fixture: 1 pass/19 assertions, including
90-day cleanup, 12-month review, bounded hold/24-month expiry and zero remaining
owned users. Profile/retry fixture: 2 pass/32 assertions, both receipt choices,
analytics-residual rejection and unrelated-account preservation; owned fixture
cleanup executes. One earlier concurrent fixture run exposed P2034 serialization
conflict; atomic source processors now retry only rolled-back P2034, at most three
fresh transactions, rereading authorization and current state each time.

Added `preview-simulator` extending Preview and guarded `--ios-simulator` selection
only for iOS Preview builds. Environment, exact clean commit, Preview host and iOS
identity guards remain intact; Production/OTA/submission gates are unchanged.
This enables native QA without the missing ad-hoc Preview signing credentials.
[Expo simulator-build documentation](https://docs.expo.dev/build-reference/simulators/).
No successful native binary, OTA, TestFlight upload or submission is claimed here.

Still required: real domain processing and result-email delivery; ordinary/staff/
sole-owner/Apple-linked end-to-end acceptance; positive assistant/chat/analytics and
business/clinical dispositions; provider/age safeguards; signed native flows and
real EAS Update; screenshots/privacy report/restricted reviewer access; submission.
Ishaq Yusuf remains the approved privacy/abuse lead; a named backup is still pending.

### Assistant inventory and native build follow-up — 9 October 2026

The merged assistant schema includes actor-attributed attachments and usage events,
including usage without a run. Both now join the direct-attribution blockers for
profile processing and completion. Seven additional inventory categories are
checked; generated-client TypeScript and scoped checks pass. Latest combined unit/
API/job run:338 pass/9 integration skips/0 fail,1,032 assertions. Fresh guarded
Development readback confirms all seven tables and AccountPrivacyRetention exist.
The earlier live fixtures validate commit962efacc; this counts-only extension is
covered by four new refusal regressions and schema/type verification.

EAS queued iOS Preview Simulator build80a51723-a13f-47f9-ab93-1700b1421517 from
exact clean commit962efaccee318fe554283300ad83578bf07050e1, buildNumber2,
runtime418fb2c8cb8a17496545a61dc4976c2eaf69d04c. Current statusIN_PROGRESS;
no successful binary/native-flow/OTA/TestFlight claim. Existing EwaTrade QA iPhone
15 Pro simulator051FAF63-6FB2-4C12-B0DB-45832083C5F4 remains shut down.

Automatic approval review rejected GitHub push/edit because it required explicit
publication authority for ishaqyusuf/ewatrade and draftPR57. The action never ran;
remote head remains9423fcc3. Concrete approval question is pending. Work is saved
locally; Production processing/configuration remains disabled. Preparation3/6;
release0/4, steps1–2in progress and3–4pending.


## Approved 18+ chat implementation and native checkpoint — 9 October 2026

The owner approved free-form Store chat for signed-in accounts declaring age 18+
while keeping existing account/catalog access and reporting/support. Shared source
now gates customer text, staff sender and recipient, and WhatsApp message ingress.
Age/account authority is checked before moderation and again in the write
transaction. Guests, undeclared accounts and teen accounts cannot send free-form
chat; new direct WhatsApp chat bindings and candidate continuation are refused.
Historical reads, reporting/blocking and permitted structured intake remain.
Guest voice upload/append is refused; this does not certify image/document safety
or remove all free-text fields from structured service requests.

The age-status API adds `freeFormChatEligible`; its existing `eligible` field still
covers the 13+ account/history path. Mobile composer copy uses the shared 18+
rule and removes the teen click-through acknowledgment. Age range is self-declared,
not identity verification. The saved age correction route remains Support.
Storefront copy, published disclosures, media/provider eligibility and native
acceptance remain open. The Production release guard still fails closed.

Validation:225 chat tests pass,717 assertions across37 files; scoped generated-client
DB TypeScript and Biome on28 changed source files pass. EAS/artifact guards:64 tests
pass,325 assertions. Mobile focused TypeScript is being checked separately. These
are source checks, not native acceptance or live Production activation.

Preview Simulator build80a51723-a13f-47f9-ab93-1700b1421517 finished from
commit962efaccee318fe554283300ad83578bf07050e1. Its embedded fingerprint matches
runtime418fb2c8cb8a17496545a61dc4976c2eaf69d04c. The exact downloaded artifact was
installed and launched on the EwaTrade QA iPhone15 Pro simulator, reaching sign-in
after Continue without a QA workspace. EAS reports build2; the actual bundle says
CFBundleVersion1. This earlier binary does not contain the approved18+ changes.
No authenticated native flow, actual EAS Update, device/TestFlight build, screenshot
set or review submission is accepted. The20 bundled privacy manifests are an
inventory, not a final aggregated privacy report.

Preparation remains3/6(50%); release acceptance0/4. Steps1–2 are in progress,
steps3–4 remain pending. Deletion domain dispositions, delivered result emails,
ordinary/staff/sole-owner/Apple-linked acceptance, moderation provider/territory
facts, matching published notices, reviewer access and final native QA are open.
GitHub publication remains pending explicit destination approval after automatic
approval review rejected push/PR edit; no rejected action ran.


### Storefront and mobile transport validation follow-up

Storefront now applies the same shared18+ account predicate and removes the teen
click-through acknowledgment; Guests receive the same readable-history/report/
Support explanation. Existing shared shadcn Button is reused. Midday OAuth-consent
analogue and repository API boundary were inspected; no route or DB layer was
moved. Six existing Storefront age/report/block checks pass with19 assertions under
the guarded local profile. Initial bare test run lacked the database environment;
this was corrected using the existing root profile loader, with no database writes.

Focused mobile TypeScript exposed an inherited tRPC logger runtime defect:
loggerLink passes direct operation fields rather than opts.op. A small guard now
uses the actual path and fails closed for missing paths; auth.* stays excluded.
Four real transport/privacy checks pass with10 assertions. The initial focused
TypeScript config omitted the existing React Query ambient declaration and also
found the inherited catalog worker DOM/Node URL type conflict. After including
ambient types and fixing the logger, the bounded180-second recheck timed out.
No mobile typecheck pass or native UI acceptance is claimed. Storefront focused
TypeScript is checked separately. Preparation3/6; release acceptance0/4.


### Resume validation — 9 October 2026

This supersedes the earlier mobile/Storefront typecheck limitations above.
Scoped mobile TypeScript now passes with the existing ambient declarations included.
Scoped Storefront TypeScript passes. The inherited server photo worker URL conflict
was repaired by using node:url URL types and returning pathToFileURL directly at
both job boundaries. Five existing photo-processing/review tests pass with27
assertions, including the owned HEIC fixture. No moderation decision or storage
permission was changed. The mobile authentication logger fix remains covered by
4 transport checks/10 assertions. The225 chat checks/717 assertions,64 EAS/artifact
checks/325 assertions and6 Storefront age/report/block checks/19 assertions remain
valid; the type-only photo boundary change requires no repeated unrelated suites.

18+ server, mobile and Storefront gates are implemented locally. The exact legal
amendment remains a draft; no approved immutable legal version was edited or
Production flag enabled. Native UI, adult/teen/unknown/Guest flows and actual OTA
receipt/recovery still require acceptance. No stage receives release credit from
these source checks. Preparation3/6(50%); release acceptance0/4, steps1–2 in progress
and3–4 pending. GitHub push/PR edit still needs destination approval.
