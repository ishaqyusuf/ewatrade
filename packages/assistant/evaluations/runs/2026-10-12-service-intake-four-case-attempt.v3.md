# D04 scheduled four-case rollback attempt v3 — 12 October 2026

Outcome: failed, exit1. The coordinator released all other connected slots and
scheduled exactly one exclusive canonical attempt. The exact command had prior
explicit human approval for execution outside the sandbox; automatic escalation
review allowed this attempt. No rejection or approval workaround occurred.

Command:
RUN_D04_QA_ROLLBACK=1 node artifacts/assistant-operations-parallel/D04/run-rollback.mjs

The guarded child ran against the exact QA database/Tenant/Store/Owner and wrote
artifacts/assistant-operations-parallel/D04/rollback-failure.v3.json.
No rollback.v3.json success artifact exists. The runner's finally disconnected
Prisma, the child/parent exited1, and the QA slot is released. No retry or signed
run was performed. D04 remains partial/planned/unaccepted, roadmap13/45 (28.9%).

## Actual failure and case coverage

Case: creation-replay-receipt. Native creation and replay phases completed;
canonical total/work policy, same Intake/Order/first Job replay IDs, tracked-only
Job graph and unpaid payment gate checks executed without assertion failure.
The subsequent owning Order lookup failed with Prisma P2028: timeout30000,
timeTaken30720ms. Customer-to-Order identity, zero message-intent and original
owning receipt checks were therefore not reached. Completed cases:0/4.
Immutable-snapshot, stale-review and revoked-authority did not start because the
runner fails fast. Every case remains in the source; nothing was narrowed or
counted as complete. The timeout is not classified as a domain refusal.

rolledBack=false in failure evidence means the case did not reach its deliberate
identity sentinel. The transaction expired and full saved-state comparison passed
following the error. Before and after hashes both equal
be157acb19ccdd8b2e016056ba0192f6. This version3 fingerprint covers the complete
listed Tenant/catalog/customer/service/commercial graph, CustomerLedger account/
entry/command/receipt/allocation/release tables, and Finance Books/accounts/
commands/journals/journal lines/periods. It establishes unchanged covered state
for this failed case; it does not prove receipt/refusal coverage or ticket success.

## Measured timings

| Phase | Duration ms | Outcome |
| --- | ---: | --- |
| saved-state-before | 224 | ok |
| fixture-batch | 209 | ok |
| canonical-review | 2664 | ok |
| canonical-execution | 20386 | ok |
| canonical-replay | 6837 | ok |
| owning-order-check | 218 | error |
| transaction, including rollback/error | 30723 | error |
| saved-state-after | 210 | ok |

Total instrumented elapsed31158ms; transaction callback starts633ms after tracing
begins. Each transaction remains Serializable, maxWait10000/timeout30000.
Delegate invocations: fixture1, review8, execution46, replay12, owning-order1.
These are delegate calls, not SQL request counts; relation includes may issue
multiple round trips, and overlapping durations must not be blindly summed.

Largest measured delegate spans:
- execution serviceJob.findFirst:3212ms
- replay serviceJob.findMany:3211ms
- execution sellableOffering.findFirst:2013ms and2005ms
- execution commercialOrder.findUniqueOrThrow:1816ms
- three phase-specific sellableOffering.findMany spans:1016/1009/1004ms

The batch fixture is now a small209ms span, so fixture setup alone does not
explain this timeout. Native creation plus replay consumes most of the budget.
The two full Job hydration reads and Offering/Order relation reads are concrete
candidates for a separately reviewed native optimization. This is an inference
from delegate timings, not query-level proof. Fresh authority/revision checks,
canonical locks, required hydration/results, receipt atomicity and all assertions
must remain; no timeout increase, persistent fixture reuse or unscheduled retry.

The process also emitted pg's existing concurrent-client.query deprecation
warning. It was not the thrown failure; no driver setting was changed.

## Handoff and Brain impact

Failure JSON contains the complete per-call/per-phase trace and exact hashes;
this report captures actual exit/error and limits. Source implementation and
25-test/102-assertion offline evidence remain unchanged by the run. Updated
D04 feature, source plan, composition ADR and ignored handoff with the result,
zero completed cases, state preservation and released-slot status. Common paths,
schema, providers, server lifecycle, capability activation and git were untouched.
The signed suite and any further canonical retry require coordinator scheduling.
