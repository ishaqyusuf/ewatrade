# Full Production release preflight — 7 November 2026

Status: database warning exception approved and applied to Preview. Frozen candidate
`cb36b5689` deployed Dashboard, Marketing and API to Preview. Storefront built but
its unregistered-host verification rejected a streamed HTTP 200 instead of 404;
jobs and Android did not run. The publication check now precedes the route loading
boundary, preserving the storefront UI and the strict runtime check.
Production remains untouched and native release has a separate readiness block.
No worktree was created. The narrow
marketing-only proposal is superseded by the owner's “deploy all” instruction.

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
