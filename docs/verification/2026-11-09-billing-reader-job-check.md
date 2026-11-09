# Hosted owner-plan read check — 9 November 2026

Status: source verified; no deployed diagnostic or task-local read accepted yet. The prior [configuration rollout](2026-11-09-billing-reader-runtime-activation.md)
at529a44998 remains verified. Apple2/6 unchanged; mobile release excluded.

The owner-approved reader activation/acceptance needs proof from inside the jobs
process. The existing reminder task can write/send, so it is not a safe diagnostic.
The new unscheduled `store-billing.verify-owner-plan-read` task calls the existing
canonical tenant-plan and owner-plan readers without any business mutation.

Admission requires the existing exact Production reviewer policy with exactly one
immutable owner. Input accepts only that owner ID and one valid business ID; it
cannot request a plan, provider, environment or write mode. Before reading plans,
the handler enforces current ACTIVE OWNER membership inside one RepeatableRead
transaction with PostgreSQL SET TRANSACTION READ ONLY, bounded10s wait/30s timeout.
No records are locked or changed. Output contains plan/source facts and trusted
task runtime project/environment/version, with no owner/business identity.

Preview or removed reviewer policy returns disabled before loading the DB client.
Wrong owner/membership or malformed/broader scope refuses with one generic error.
No scheduler, product/assistant caller, HTTP/RPC, new credential, feature gate,
payment/provider action or reminder dispatch is added. One attempt and concurrency1
bound diagnostic execution. An actual same-scope paid read may be accepted only
after clean candidate Preview/matching smoke/Production and verified task result.
Free fallback and native/lifecycle checks remain separate; no fixture or live
release of the existing business will manufacture a passing result.

Focused admission/disabled-path tests pass3tests/18assertions; jobs typecheck and
changed-file Biome pass. Scoped quick smoke used exactly the five owned source,
test, impact and receipt paths and passed284tests/1813assertions plus QA tooling
types/lint. This is narrower than whole-checkout verification. H01 uses APP_ENV=local
for the canonical all-route snapshot and passes; regeneration reproduces committed
COVERAGE.md exactly. An initial command without that profile used the non-QA router
and falsely appeared stale; no procedure/capability row or snapshot is changed.
H02 passes one record with zero capability/procedure changes. Documentation links
and git diff --check pass. Connected proof remains pending.

Brain impact: local `.brain/BRAIN.md`, `.brain/tasks/in-progress.md`,
`.brain/features/owner-wide-billing.md`, `.brain/features/native-store-billing.md`,
`.brain/api/contracts.md` and `.brain/api/permissions.md`. Internal task contract
only; no schema or product/assistant permission changed.
