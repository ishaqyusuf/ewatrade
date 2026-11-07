# Full Production release preflight — 7 November 2026

Status: resumed after the owner explicitly authorized committing all current
changes and deploying all to Production without a worktree. Source review and
candidate verification are in progress. The narrow
marketing-only proposal is superseded by the owner's “deploy all” instruction.

## Owner decisions

- Deploy all committed changes through the normal production release path.
- Keep worktree use prohibited (explicit response during this preflight).
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
