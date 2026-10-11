# Product return — first isolated database acceptance attempt

- Date: 11 October 2026. Evidence: `deterministic-integration`.
- Run ID: `0ab7a6f9-706b-4314-88e6-47aa7b465eb0`.
- Verdict: **fail**; no return acceptance claimed.
- Source baseline: `aec9d38a` plus the return integration check introduced in this report's commit. Shared checkout had unrelated concurrent edits.
- Target: isolated Development `ewatrade_general_assistant_main_20261009`.
- Provider/model/build: no provider, API source execution; no dashboard build.

Owned QA fixture creation and fulfillment reached the stale-review phase. The run
then failed with Prisma P2028, “Unable to start a transaction in the given time”,
from `inFreshGeneralTransaction`. Result: zero pass, one fail, five assertions,
100.21 seconds overall. Owned fixture cleanup completed; process exited 1.
Transaction limits remained maxWait 10 seconds / timeout 30 seconds.

The first version used generic rejection assertions for missing target and
over-return, so this run does not prove their domain error codes. Those assertions
now require NOT_FOUND / INVALID_ORDER, and draft stage tracing was added before a
future rerun. Scoped API dependency TypeScript passed after correcting the expected
proposal status from DRAFT to PENDING. No runtime change was made to mask P2028.

The test covers a no-Finance-Book dataset only. Restock, other dispositions, stale
refusal, receipt rollback and replay were not accepted by this failed run. Financial
valuation/journal acceptance, live-model behavior and dashboard confirmation remain
separate gates. The test's temporary in-process capability activation is restored in
finally; the application manifest remains planned.

Log: `artifacts/assistant-operations-web/d03-return-database-acceptance.log`.
No live database suite remains from this run. No mobile work or hosted deployment.
