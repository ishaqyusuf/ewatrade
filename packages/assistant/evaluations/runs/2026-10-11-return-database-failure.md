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

## Traced retry

Run `56314a9f-d939-4494-bf04-d55878378377`, source `78c1ffc6` plus the QA cleanup
ordering fix and explicit no-Book assertion. Process exited1 after239.31s,
zero pass/one fail/22assertions. Owned fixture cleanup completed.

Reached and passed exact missing-target/over-return codes, stale stock refusal,
receipt-failure rollback, successful0.5restock and replay. Failed during the subsequent
non-restock phase: original-cost relation loading encountered an expired transaction
at32196ms (limit30000ms). Full all-disposition acceptance remains failed. Two measured
drafts took14609ms/15128ms,57SQLcalls each, pool acquisition0.082ms/0.042ms. SQL time
is aggregate duration and must not be interpreted as wall time or lock wait.

Log: `artifacts/assistant-operations-web/d03-return-database-traced.log`.
No database process remains. The no-Book cost preview was subsequently changed to
validate scoped exact quantities and check the Book before loading financial history.
Financial-Book behavior still uses the full validator. Focused16tests48assertions
and scoped source TypeScript passed; database verification of the optimization is
pending. This is not a proven fix for the earlier transaction-start failure.
