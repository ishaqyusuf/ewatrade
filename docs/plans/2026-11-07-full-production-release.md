# Full Production release preflight — 7 November 2026

Status: Production Dashboard, Marketing, API and jobs are now at
`6a4948c809ea3a83d3aed9ae4ca2d3f6a96f40d3`; the existing Production schema remains
synchronized at database release `bf9bc356`. The normal executor exited 0 and API
health passed. Five of six Production components are complete (83.3%). Native
remains blocked by incomplete Android Preview acceptance and the existing store
readiness gate. Genuine Apple Sandbox TEST delivery succeeded on the exact new
Preview API; it does not establish purchase/lifecycle acceptance. No worktree.
Historical entries retain earlier states; the latest receipt below is authoritative.

## Owner decisions

- Deploy all committed changes through the normal production release path.
- Keep worktree use prohibited (explicit response during this preflight).
- The Samsung disconnected; the owner explicitly authorized `emulator-5554`
  instead, including installation of the candidate Preview build.
- Use Samsung SM-S928U1, serial R5CX153J81W, for required Android Preview testing;
  installation of the Preview build is authorized if needed. Existing QA data,
  draft cancellation, no submitted sale/payment. This authorization is retained;
  no device changes or test execution occurred in this preflight.

## Observed release plan

At committed HEAD `70ac4e88fc10081586315b2a3ced94cf0ad588ed`, the normal full
Production status and dry run include database, Dashboard, Marketing, API,
background jobs and Android. The configured Storefront pilot remains Preview-only;
no production publication configuration was invented.

The dry run reports database push, Git-connected web/API deployment, Trigger jobs
and a new Android build. The Android fingerprint was computed while other authors
were modifying the checkout, so its build decision must be rechecked against the
frozen committed candidate. EAS authentication resolved the same ishaqyusuf account;
no build, update or deployment was submitted.

Environment audit returned names-only warnings for newly referenced variables in
Dashboard/Marketing/API. Their required-versus-optional status remains to be
resolved from the frozen candidate; no values or provider settings changed.
Private output: /tmp/ewatrade-all-production-plan.txt.

## Remaining prerequisites

1. Review and commit all current changes in active main, as explicitly authorized
   by the owner on resumption. This includes billing/API/mobile changes, AGENT_CHAT
   and staged explainers. Do not create a worktree, stash or discard work.
2. Freeze the actual committed candidate and run the existing clean-source gates.
   Earlier marketing-specific verification does not cover the full 423-commit
   release scope observed before this receipt.
3. Obtain candidate-bound Preview web and Android acceptance. Current
   smoke-preview.json has web only; configure the approved Samsung and exact
   installed Preview build identity. Available Preview web receipts are stale;
   neither web nor Android has a receipt for the preflight candidate.
4. Recheck the full provider/environment/native plan on that candidate; preserve
   database, Preview/Production identity, compatibility and approval gates.
5. Run the normal Production executor only after acceptance, then verify runtime
   health and record actual deployment/build/job identifiers and limits.

## Earlier preflight stop (superseded commit authorization)

The existing release executor calls git worktree add automatically when the active
checkout is dirty. The owner explicitly disallowed that action. Direct candidate
verification also requires a clean checkout; allow-dirty is forbidden for verified
Production. The current source contains active unrelated changes. No release command,
push, merge, schema write, jobs publication, native build/update, or device install
was performed. Read-only status/dry-run success is not release acceptance.

## Verification and Brain

Full status and provider dry run exited successfully; receipt/checkout inspection
identified the unmet prerequisites. Documentation whitespace/scope check passes.
No product source changed, so source/UI tests are not repeated for this record.
Updated local .brain/features/marketing-launch-v4.md and
.brain/tasks/2026-11-07-marketing-full-polish.md to preserve the new all-components
scope, no-worktree decision, Samsung authorization and blocked release state.

## Resumed source checks

Owner authorized committing all changes in the current checkout, including the
billing source and staged banking guide. Offline doctor, full changed-path fast
smoke (259 tests/1,679 assertions), DB and Marketing types, H01 and H02 pass.
Focused subscription and Google verification files independently pass 20/100
and 4/13. The implementation receipt records guarded local-Neon concurrent
admission acceptance; paid-store activation is still disabled and separate.
The first Marketing type run overlapped Prisma generation and failed on missing
generated types; its rerun after generation passed. No source bypass was used.
Preview smoke config now names the approved Samsung and existing QA business/item;
its actual candidate build identity must be added after the Preview build.

## Executed candidate and blocked rollout

- Candidate `0bd862763`: all 26 changed files committed, including billing,
  coordination history, documentation and the banking explainer. Clean candidate
  smoke passed 259 tests/1,679 assertions; fast receipt is private/ignored.
- `bun run release --preview --yes` used the current clean checkout. Database
  push stopped on two new unique indexes on ManualPaymentReport:
  `customerReceiptId` and `customerFundsRefundRequestId`. No override was passed.
  Executor reported “Released so far: nothing”; no application Git push, jobs
  deployment or native build/install followed. Production was not deployed.
- Read-only profile-guarded inspection confirms both columns are absent in both
  Preview and Production, so there can be no existing values to duplicate.
  Prisma read-only schema diffs match exactly (SHA-256
  `0d09846e09abe4cf111cba28e863921370142eef912ec371325b13ecdf6f694c`):
  14 new tables, 8 new enum types, 19 unique indexes, 20 other indexes and
  28 additive ALTER TABLE statements; no DROP, DELETE, UPDATE or TRUNCATE.
  Private review files: `/tmp/full-release-preview-schema.sql` and
  `/tmp/full-release-production-schema.sql`. No DDL was executed by these reads.
- Specific owner approval was requested for accepting only those two warnings
  on the reviewed targets. Project coding standards prohibit automatic
  data-loss/reset flags and require preserving Prisma warnings. This exception
  is not inferred from the general deployment request; new warnings still stop.
- Existing Production API and public legal live preflights pass. The independent
  `scripts/check-teen-release-readiness.mjs` exits 1 and explicitly blocks native
  Production release pending verified adult-chat server safeguards, legal/media
  handling, classifications and exact signed-path acceptance. Passing the public
  legal probe does not clear that broader native gate. Do not edit away the gate
  or claim that a private validation artifact is a Production rollout.

Next: resolve the narrow database exception, pin the then-clean candidate,
continue the existing Preview executor, install its exact Android build on the
approved Samsung, and obtain matching Preview receipts. Resume Production only
with its existing checks. Native release requires its separate acceptance work;
store publishing/merchant setup has not been completed by this release task.

## Approved warning exception and partial Preview rollout

Owner explicitly approved the two warnings for Preview and Production. Fresh
Preview diff matched the reviewed SHA-256 exactly. The normal guarded command
`bun run db:push --preview -- --accept-data-loss` succeeded with only those two
warnings. The subsequent unmodified release database step reported in sync.
The approval persists for the same reviewed Production changes, subject to a
fresh diff and stopping on any new warning; it is not a general reset authority.

`daf00b5f0c24b9e5fe0997fe90995c65c077d56e` adds the other author's final verification
documentation to the reviewed source. Clean candidate smoke passed259/1679.
Normal full Preview executor pushed origin/preview and recorded:

| Component | Outcome | Provider identity |
| --- | --- | --- |
| Database | Synchronized | Preview ewatrade_qa_v1, fingerprint6f198191 |
| Dashboard | Ready | dpl_Gk6Qn6Yt1BbuBbesAZiuyK62aQF4 |
| Marketing | Ready | dpl_AwV1WcUXouxLBX71cziq6o41EfEM |
| API | Ready | dpl_ByuzW9xbFBRD2cHHsxAZ3n66SFbo |
| Storefront | Stopped before upload | STOREFRONT_PREVIEW_SOURCE_NOT_CLEAN |
| Jobs / Android | Not executed | Executor stopped at Storefront |

Marketing Preview alias: https://preview.ewatrade.com. Provider Ready is not a
passed candidate-bound web/Android smoke receipt. New concurrent iOS billing
preparation edits appeared while Vercel built the candidate. The clean-source
guard prevented upload of mixed source. By the time a targeted local executor
interrupt was attempted, it had already exited1 on that guard; no other process
was stopped. Root Agent Chat freeze request7022e568-dcfd-4d75-97b2-7aee30cf12a4
and user coordination question request a stable checkout. No files were stashed
or discarded and no worktree was created.

Coordinator reviewed the new native routing/preflight changes: controller
wrappers3/6assertions (18 child cases), billing readiness12tests, subscription
flow source guard and Mobile types pass. Author added the Apple preparation
receipt and H02 record; H02 passes. These remain source preparation with billing
flags closed, not signed Apple/Android acceptance. Freeze/commit the final source
before resuming the standard executor with a new exact candidate.

## Stable-checkout retry and confirmed local interruption

The other author committed the verified native preparation as `220e40277`; this
coordinator committed the prior release receipt/freeze note as `adb027193`. The
checkout was clean, candidate smoke259/1679 passed, and the normal Preview
executor pushed `adb027193` to origin/preview. It correctly reused the completed
database step. Vercel accepted new web builds for the exact candidate.

A further tracked edit to `docs/billing/apple-paid-launch-2026-11-07.md` appeared
while the mobile-release chat continued provider work. To prevent another
mixed-source upload, only this coordinator's identified local release processes
63498/63496 were interrupted; exit130 confirmed. External Vercel builds were not
cancelled. No jobs/native upload, installation, Production database operation or
Production rollout was performed. No worktree, stash, reset or discarded edit.

The user's earlier database exception remains approved. The current required
coordination is a stable checkout: pause other tracked edits or finish that work,
commit its complete source, then pin a final candidate and resume the existing
executor. A specific user coordination question is pending; general deployment
permission and the approved Samsung are retained and need not be asked again.
Native Production acceptance remains a separate gate.

## Coordinated freeze resumed after Apple setup

The owner explicitly authorized Apple/deployment chat coordination; the human
reply was verified in the Apple chat. Apple and Android confirm all tracked edits
and commits frozen at `d6de088f8`, including AGENT_CHAT. New evidence stays outside
the checkout until the release coordinator hands back ownership. Source includes
password recovery df9dbb798, Apple five-day courtesy aea81ba02 and native linkage
d01fae2c8, saved notification URLs510cd0bfc and shared privacy auditd6de088f8.
Existing source/type/domain receipts are reused; no paid activation is implied.

The owner authorized already-running emulator-5554 for Preview Android smoke
because the earlier approved Samsung is disconnected. Ignored smoke config now
names that emulator; exact build ID will be added once the candidate is built.
Existing QA data/draft cancellation remain mandatory, no fixture or sale/payment.

Release-wide source plan found ten unmapped files in customer-messages,
order-receipts and private-media across1750changed paths since origin/main.
Reviewed three existing suites: template/phone helpers, embedded-font PDF output
and memory/local-test-object erasure, no provider/DB calls. Isolated smoke env
passed22tests/91assertions. Added explicit package mappings and these suites to
bounded shared smoke; regression preserves unknown-package rejection. Full plan
now reports zero unknown paths (57selected test files including the standalone
experiment); workspace smoke passed282tests/1780assertions across56files, plus
QA types/Biome. H02 reports no gated change; product behavior is unchanged.
This is source verification, not whole-feature or signed-native acceptance.

No duplicate release/build process was active at resumption. Database exception
remains approved for the exact reviewed Production diff. Apple settings installed
by its owner remain unchanged here: production-checkout false and native purchase
scope false. A closed STORE_BILLING_ENABLED gate may return503 even for Apple TEST;
the Apple owner will inspect/canary only after the exact candidate API is Ready.

## Signed Preview smoke navigation correction

Candidate `18c5aed7` completed all configured Preview deployments: Dashboard
`dpl_AQhhKCBmkNgrRDLH76ZRPNnDA7aX`, Marketing `dpl_2wRvogugh6TXURzKAKHYqzEpPS9p`,
API `dpl_He8QKGaZBtqwD2JhoyveWBMzXinV`, Storefront
`dpl_7pWf1Wb76H6vrhQ7piPkPSFhcHHW` (real 404/no-store and alias checks passed),
Trigger version `20261107.1`, and Android Preview build35
`91735df8-e7c9-4a80-b4bf-36019a7b4ccc`. APK checksum
`24bed222777b1e33ab49cf7d0f14df79d204e29986d8128faacfb067681c685c` verified before
installation on owner-approved `emulator-5554`.

Candidate-bound web smoke passed. Android verified embedded build35 and selected
the existing QA business, but the catalog step failed: internal deep links are
intentionally development-only, so Preview routed to Home. A settled-session
retry confirmed that behavior; normal Goods navigation found the expected catalog
item (private diagnostic, not a passing release receipt). The smoke now uses
visible Goods/Home/New sale/More/Plan & billing controls and normal sign-out,
without relaxing Preview link restrictions or any assertions. Its outer deadline
is ten minutes for slower first-run emulator setup; per-step deadlines remain.
Flow changes select mobile release so exact-candidate acceptance can use the normal
compatible OTA path. Fresh receipts are required. Production remains untouched.

The compatible c422a93f Preview OTA published as group
`9888e463-1db5-46aa-ba7d-96439eb5d0c5` on native runtime
`0a1cc8debc0d42e5b32ff0455e3b5368ff6fed7e`. Fresh web smoke passed.
Android's pre-UI verifier then exposed an outdated EAS permalink assumption:
current CLI uses `/update/<updateId>` rather than a project-ID path. The verifier
now reads only that exact HTTPS immutable Expo manifest and binds its project ID,
update ID and runtime to the inspected candidate/branch/group. Commit, project,
rollback, native build and on-screen running-update checks remain mandatory.
Nine focused tests/64 assertions pass, including foreign project, wrong update,
wrong runtime/commit/branch/group, rollback and malformed/duplicate manifest
rejection. The real c422a93f manifest passed the same verifier. Fresh candidate
receipts are still required; no Production rollout has occurred.

## QA sign-in race found during actual Android acceptance

The 8c1a82b4 OTA passed provider identity verification; web smoke passed. Android
exposed slow first-run startup/long-menu deadlines and then a persistent blank
screen after choosing the QA business. Full-screen QaBusinessesScreen reacted to
the changed token with Back while use-auth concurrently dismissed sign-in routes
and replaced Home. Removed that competing token-change navigation; the auth
provider remains the sole sign-in navigation owner. Manual/revoked-domain closing,
compact-sheet dismissal and all authority checks are unchanged. Startup now waits
for either sign-in or the navigation tabs; the long-menu sign-out scroll keeps a
bounded60second deadline. These changes require a new compatible OTA and fresh
acceptance. Diagnostic runs are not release receipts; Production is untouched.

## Production outcome and remaining native blocker — 7 November 2026

The owner-approved additive Production schema diff was rechecked and matched
SHA256 `0d09846e09abe4cf111cba28e863921370142eef912ec371325b13ecdf6f694c`.
The specifically approved `db:push --prod -- --accept-data-loss` succeeded with
only the two new nullable ManualPaymentReport unique-constraint warnings on
customerReceiptId/customerFundsRefundRequestId. The ordinary release database
step then confirmed in sync. No reset, dropped data or additional warning.

The clean current main checkout ran the normal root executor:
`bun run release --production --only database,dashboard,marketing,api,jobs --yes`.
It reused valid source/web acceptance, pushed the exact candidate to origin/main,
and completed successfully. No worktree, dirty-source override, gate bypass,
second concurrent executor or native Production publication was used.

| Production component | Verified result |
| --- | --- |
| Database | Schema synchronized; ordinary release push in sync |
| Dashboard | Ready, dpl_HZJFBYLL4FBEnURG38xCSy2MjA2M; https://dash.ewatrade.com |
| Marketing | Ready, dpl_5NUte5E4BDmTNFbLRLb1NEQSy3Jx; https://www.ewatrade.com |
| API | Ready, dpl_APSyGG3fueoMiAKR8NrHvHwCKkHy; https://api.ewatrade.com; health passed |
| Jobs | Trigger Production version 20261107.1, deployment xt1te9ji; deploy exited 0 |
| Native | Not released; exact Android acceptance and store readiness remain blocked |

All five Production release tags resolve to bf9bc356. The final documentation
commit records this result; it is not a new deployed application candidate.

Source checks passed 283 tests / 1,796 assertions, focused QA route guards 4/4 and H02.
Exact bf9 Preview web smoke passed with clean source and verified runtime
(receipt 63ac047f-6f4e-4566-b67e-fa334584116c). Preview Storefront real 404/no-store,
refusal content/assets/legal/app-link checks and alias passed; Preview jobs
version 20261107.2 and compatible Android OTA were published.

Android build 35 is 91735df8-e7c9-4a80-b4bf-36019a7b4ccc, runtime
0a1cc8debc0d42e5b32ff0455e3b5368ff6fed7e. Exact bf9 Preview OTA group is
3f4aaa20-4ce8-4fd5-b4db-4858b104a1b7; Android update is
01a1b7ac-21e8-784a-8d43-95e8b7db8470. Owner-approved emulator-5554 lost Android
package services and was restarted on the same AVD without clearing user data.
After recovery, same-candidate qa:smoke passed the running-update identity check,
normal sign-out and QA selection, then failed because Goods was absent. The
screenshot shows populated QA Home with a blank bottom navigation bar. It does
not establish a passing runtime receipt or prove the remaining root cause. No
sale draft/payment was submitted. Private failure artifact:
`.scratch/qa-release/artifacts/20fd40f2-dc8a-49b1-a016-bf351c0ca305`.

The unchanged `check-teen-release-readiness.mjs` independently exits 1 for missing
verified server rollout, effective legal notices, media safeguards, platform
classifications and signed-path acceptance. Billing stays closed; Apple Sandbox
TEST closed-gate 503 is negative evidence, not paid acceptance. Native work must
close these specific failures and obtain a fresh matching Preview receipt before
normal Production release. The deployment authorization and no-worktree rule
persist; this partial release does not claim the entire requested rollout done.

Private execution evidence: `/tmp/full-release-production-web.log`,
`/tmp/full-release-vercel-production-final.json`, and
`/tmp/full-release-android-smoke-bf9-ready.log`. No secrets or generated test
artifacts are committed.

### Live marketing and Logly verification

Production https://ewatrade.com redirects to https://www.ewatrade.com and returns
HTTP 200 with the approved warm design, existing layout and heading “Your whole
business, from request to paid.” Browser page errors were empty; FAQ opens.
Normal anonymous site_visit, page_view and marketing_demo_interacted were sent
through /api/analytics. The FAQ event retained only fixed labels:
surface=marketing, channel=faq, action=faq, category=catalog, status=opened.
Collector responses were 202 with accepted 1 then accepted 2, duplicate 0,
mode=database. Read-only queue inspection confirmed empty after delivery.
The first shorter observation saw only site_visit; allowing the next scheduled
batch resolved the uncertainty without changing product code or analytics policy.
This proves live visit/page/FAQ delivery, not every funnel's runtime outcome;
remaining important-event coverage has the focused source/sanitizer/proxy checks.
No form, customer record, sale, payment or paid activation was submitted.
Private evidence: /tmp/full-release-production-marketing-timing.json and
/tmp/full-release-production-marketing.png.

Brain impact: updated local marketing-launch-v4, marketing-full-polish task,
tasks/in-progress and database/migrations with the Production result. Earlier
source corrections also updated storefront-template-factory, engineering/ai-rules
and mobile-dev-preview-qa-accelerator. Brain stays intentionally local/ignored;
this tracked receipt preserves release evidence without force-adding Brain.

## Corrected Apple/Android handoff released — 7 November 2026

Resumed under the existing deploy-all authorization, in clean current main without
worktrees. Included Android harness commit f5d5806e, Apple review-Sandbox source
630f19b8 and canonical Production-profile correction 6a4948c8. The source fixes
retain default-off reviewer policy, immutable owner-ID allowlist, exact signed
Sandbox identity and ordinary/Google environment refusals. Both established
Production profile spellings are accepted with APP_ENV=production and every other
gate retained. Production settings were not overwritten to resolve the spelling.

Reviewed both handoffs; offline doctor and root candidate checks passed 283 tests /
1,796 assertions. Reused author receipts for focused Apple checks, full API/DB
types, guarded Development persistence/cleanup and H01/H02 where unchanged;
profile correction has focused 11 tests / 134 assertions. No schema change.

### Preview and genuine Apple receiver evidence

Only the API Preview setting STORE_BILLING_ENABLED changed false→true before the
candidate deployment, to admit the coordinated Sandbox receiver TEST. Readback
confirmed APP_ENV=preview and DEV_PROFILE=preview; OWNER_BILLING_ENABLED and new
review/forward flags remain absent. Production settings, public checkout, native
purchase scope and notification URLs were unchanged. Sensitive provider flags
return blank placeholders on read: those are not evidence of empty stored values.
The original Apple write receipt establishes Sandbox verifier identity and checkout
false; the new positive signed TEST proves the deployed receiver path.

All Preview deployments completed at 6a4948c8:

- Dashboard: dpl_223t7v1iPNyqfpdBTEH37gibKdnY.
- Marketing: dpl_3vXobrEMMwZqbzPyKBkgrdeDVv5t.
- API: dpl_BY9LBysYJSevcEgbrA4VniDv9ZyT; Ready source and canonical
  https://preview-api.ewatrade.com alias verified; health 200.
- Storefront: dpl_J3wMgcJFigus555Na79uwQA8RhFJ; configured response/alias checks pass.
- Trigger Preview: 20261107.3, deployment metfyaz3.
- Android build 35 reused; compatible OTA group
  2d7fb5f3-cf65-424d-9a6b-61bd0831f005, update
  01a1b7f9-1b58-73b0-a16b-281b4aac3746. Runtime remains
  0a1cc8debc0d42e5b32ff0455e3b5368ff6fed7e. Ignored smoke config was bound to the
  published group before automatic candidate smoke; no identity assertion bypass.

At 22:40:33 WAT on 7 November, the Apple coordinator requested one genuine Sandbox
TEST with the approved existing key. Apple reported SUCCESS (attemptDate
1794087633549). The signed TEST was independently verified with pinned Apple roots
and the SDK for com.ewatrade.app/Sandbox. Sanitized private evidence:
/private/tmp/ewatrade-apple-sandbox-canary-6a4948c8.evidence.json.
Token and signed envelope remain private and were not copied to this receipt.
This is positive receiver delivery/acknowledgement only: no charge, purchase,
renewal, restore, coverage, reviewer lifecycle or Production relay acceptance.
Apple remains 2/6; Android paid acceptance remains 1/8.

### Production outcome

After the Preview executor ended, the sole normal Production executor released
Dashboard/Marketing/API/jobs using the matching passed web receipt. Database was
unchanged and skipped as up to date. No concurrent deployment executor, worktree,
dirty override, native publication or billing activation. Provider IDs:

| Component | Result |
| --- | --- |
| Dashboard | Ready dpl_82wszJJD9YWTz3Le5pwaqj2q5kLj; dash.ewatrade.com |
| Marketing | Ready dpl_84cHbTY4n51ApkG3MNptQ8kE1n9Z; www.ewatrade.com |
| API | Ready dpl_8hHnYj6S3rTwYCYgv659bbShqA9G; api.ewatrade.com; health passed |
| Jobs | Production 20261107.2, deployment tgh7ehhh; exited 0 |
| Database | Prior synchronized bf9bc356 release retained; no new migration |
| Native | Not released; failed Android acceptance and store readiness still open |

The four changed Production release tags point to 6a4948c8. Marketing appearance
and tracking were unchanged by this billing/harness source; the earlier live
visit/page/FAQ collector proof remains relevant and was not unnecessarily repeated.

### Android acceptance remains incomplete

The first run failed before UI because Maestro's driver startup timed out. Device
and package services remained available. Restarting only the driver allowed a
same-candidate qa:smoke retry: exact running OTA/build identity, ordinary sign-out,
QA selection, catalog control/item and New sale passed. The next assertion failed
because ignored config omitted the existing variant suffix from the Add button.
Captured accessibility label is `Add Broiler pricing QA 6 Oct · Day-old`, with
₦2,500 shown. Corrected only that ignored config label; no product or QA data edits.

Because this changes the config fingerprint, regenerated web smoke passed under
35390ed991445f8cd7787d18231965c6edd449139fbb64660c0b2e31e2543578,
receipt 23694671-fd16-4587-bd63-f803ace90dcd. Production had admitted the earlier
valid same-source web receipt before the Android-only label correction; both
web checks passed. The final Android retry failed during sign-out: the captured
screen still shows the confirmation sheet, while the tap log targeted the other
Sign out text. This is a failed harness/interaction assertion, not proof of a
backend sign-out defect. No sale/payment was submitted and no full money-flow
receipt was earned. Final private artifacts:
.scratch/qa-release/artifacts/c28628fe-1fe2-4fc4-87a0-7e3d5398707e.
Earlier catalog/item-label evidence:
.scratch/qa-release/artifacts/abc84837-d890-4b7b-95ba-366059224a85.

The earlier blank-dock interpretation is superseded by the narrower accessibility
and transient-response evidence in the Android handoff. Catalog was subsequently
verified on this candidate. A future repair must scope the confirmation control
precisely and obtain the full matching receipt; do not count partial steps or
remove the total/cancel/billing/runtime assertions. The unchanged native store
readiness script still exits 1. Reviewer signup and signed StoreKit/lifecycle
prerequisites remain with the native workstream, without new human requests here.

Private logs: /tmp/full-release-preview-6a4948c8.log,
/tmp/full-release-production-6a4948c8.log,
/tmp/full-release-vercel-production-6a4948c8.json and
/tmp/full-release-android-6a4948c8-label.log. Final documentation commit is evidence,
not a new deployed source candidate. Brain release/task/mobile-QA pointers updated
locally; Apple coordinator owns its detailed Apple/Brain receipt after handback.

## Android selector candidate; emulator acceptance blocked — 7 November 2026

Apple docs 359fa7000 and Android selector 3ac9a217 were handed back committed.
Reviewed `.maestro/sign-out.yaml` and its captured-tree evidence: the confirmation
is now scoped to the direct action-row parent containing Cancel. Product source,
permissions, assertions, totals and cancellation remain unchanged. Coordinated
tracked freeze was re-established at clean 3ac9a21759fb428f0e83f5ec8e6d6ae851d96bb1.

Initial approved emulator-5554 checks showed boot_completed=1 but no Android package
service. Its AVD name was confirmed as AlGhurobaa_API34. Cold-restarted only that
same AVD/port, preserving data and using no snapshot load/save. The additional
emulator-5560 was observed and left untouched. After boot, package lookup and
ActivityManager current-user both responded. Offline doctor passed.

The normal tool's dry run selected only a compatible Android Preview OTA;
web/API/jobs/Storefront/database were up to date. No web push, schema operation or
Production release was needed for this harness-only change. Root candidate checks
passed 283 tests / 1,796 assertions. Normal `release --preview --yes` published:

- Candidate 3ac9a21759fb428f0e83f5ec8e6d6ae851d96bb1.
- Preview group 5b0fdf2d-129e-46f2-9b35-90f53ff74f8a.
- Android update 01a1b815-655b-7ef1-9762-6c0e526a3182.
- Compatible runtime 0a1cc8debc0d42e5b32ff0455e3b5368ff6fed7e, existing build 35.
- Ignored config retains exact Day-old offering, total and device; group updated
  before smoke. Config hash 704ff8bfe528034502901ca4a51b5d82e35a97f6c8dfd10559fbbdee4c403db0.

The automatic smoke then spent several minutes in startup/hierarchy access. The
owned JVM stack showed AndroidDriver.callViewHierarchy/contentDescriptor waiting.
Terminated only this task's Maestro process after the prolonged wait; the flushed
log showed launch completed and initial Sign in/More assertion begun, but the
confirmation selector was never reached. The executor exited 1 and wrote failed,
runtime-unverified receipt 35aa5085-6fc5-4e49-be65-406df9ca8069. This is neither a
selector pass nor a reproduced selector failure; no full native receipt exists.

A final bounded service check still found the installed package, but ActivityManager
and screenshot capture each exceeded 10 seconds. No further blind retry, device/data
wipe, permission change, alternate device use or assertion relaxation. No sale,
payment or fixture was submitted. Emulator remains running; no owned release/test
executor remains. Future testing needs responsive authorized Android services, then
`qa:smoke` for this candidate/config; do not redeploy merely to retry testing.

Private evidence: /tmp/full-release-preview-3ac9a217.log,
/tmp/full-release-emulator-recovery-3ac9a217.log,
/private/tmp/full-release-maestro-3ac9a217.private.txt and artifact
.scratch/qa-release/artifacts/5cbc36ad-bf79-4538-afb0-4b36a4c85c22.
Production remains 6a4948c8 (DB bf9bc356 unchanged), five of six components complete.
Native store readiness and human reviewer/signed lifecycle prerequisites persist;
Apple 2/6 and Android 1/8 are not promoted. Local Brain mobile-QA and in-progress
pointers updated; this receipt commit is documentation only.
