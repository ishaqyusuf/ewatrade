# Two-line purchase receipt performance — 11 October 2026

Evidence kind: provider-free canonical database regression with deliberate rollback,
plus source guards and read-only dashboard inspection. PN07 groundwork; this does
not establish full assistant receipt review, confirmation or operating acceptance.

Exact local ewatrade_qa_v1, classified QA Owner, retained agreement from the prior
invoice/ownership browser run. Flour2.125 bag cost1000 NGN minor; Sugar1 bag cost100.
Original invoice/ownership remain recorded. No new fixture, deletion or model call.

Baseline command:
node artifacts/assistant-operations-web/run-recognition-web.mjs recognition-receipt-performance.ts

The original canonical RECEIPT path failed at31,705ms with P2028 at the unchanged
30,000ms transaction limit. Of69 observed ORM operations before timeout, three full
recognition reads consumed10,110ms, two receipt graphs3,260ms and two stock graphs
2,497ms. This counts ORM operations, not underlying SQL round trips. Before/after
Book facts: events2, journals2, receipts0, owned stock operations0. Rollback verified.

Root cause addressed: the per-line valuation adapter reloaded the same complete
recognition owner and re-proved its receipt journal for each original goods line.
The canonical command now posts its original sorted stock lines, then loads the
complete receipt batch once and proves each owner once. The source resolver reads
actual database owners/movements, enforces1–10 distinct lines, and repeats the same
immutable cost/journal/control, physical actor/date, Store/Tenant, unit/configuration,
exact quantity and movement matching. No supplied graph, global cache or timeout
increase. The existing single-receipt adapter retains its source proof and shares
unchanged valuation arithmetic/provenance/UNKNOWN-cost rules with the batch.
Distinct stock sources are required by the batch; original registration already
requires them. Any source/valuation failure rolls back the whole canonical command.

Same two-line probe after batching completed in27,727ms, including a read of the two
new valuation events before deliberate rollback. Exact values: quantity2.125/value1000
and quantity1/value100; costs1000 and100, total1100. Both zero
openings remain known, with no unknown reason. All before/after counts stayed equal.
The completed path performed70 traced ORM operations; it includes writes the failed
baseline never reached, so those counts are not a claimed query-reduction percentage.

12 focused tests /80 assertions pass: batch/single source agreement, one owner proof
for two lines, later receiver actor/date, changed goods/unit/configuration/quantity,
actor/date/scope/journal/control/cost refusal, duplicate/oversize/missing refusal,
existing known/UNKNOWN valuation rules, invoice/ownership review guards. Affected
source/test TypeScript exits0. Its initial test expectation allowed an undefined Map
lookup; narrowed that test value before the passing check. No broad/redundant checks.

The operating margin is still tight. Full assistant physical receipt must include
fresh complete stock/valuation review, locked fingerprint confirmation and atomic
proposal completion within30s; those are pending and not enabled by this change.
This local fixture pass does not certify the older poultry Development operating
flow, larger bounds, correction/settlement, live-model or hosted acceptance.

Raw baseline/batched timing JSON/logs and the rollback harness are retained in
artifacts/assistant-operations-web and /tmp. No debug instrumentation was added to
product source. pg concurrent-query deprecation warning retained as nonfatal.
Read-only dashboard shows only prior invoice/ownership, no saved receipt. Screenshot
inspected: artifacts/assistant-operations-web/e05-receipt-rollback-agreement-web.jpg.
Its sheet closes back into the same chat. Temporary inspection tab closed.

QA fixture deletion remains unapproved and was not attempted again. E05 remains
partial; accepted13/45(28.9%), pending32/45(71.1%) including deferred A04. No mobile,
schema/migration, provider, availability change, push or deployment.
