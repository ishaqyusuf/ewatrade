# Reviewed Product return — financial acceptance failure

Date:11 October2026. Evidence:`deterministic-integration`.
Run:`29641222-e44e-453b-b5b4-b0875f97e2da`. Baseline:`836266d9`, with added progress
logging in the financial acceptance test. Isolated Development database
`ewatrade_general_assistant_main_20261009`. No model/browser/mobile execution.

Verdict:**fail**.0pass1fail16assertions188.27s. Review assertions for original cost250,
destination900→1150 and inventory/COGS250 passed before locked partial return. The
command expired in valuation-returns.ts at financeBook.findUnique after34500ms,
with configured timeout30000ms (P2028). This does not prove committed financial
return effects or rollback acceptance. No timeout was increased.

Cleanup started and was verified; process exited1. No database suite remains from
this run. Log:`artifacts/assistant-operations-web/d03-return-financial-acceptance.log`.

The no-Book acceptance remains valid for its separate scope. Full financial and
assistant browser acceptance remain open, runtime capability stays planned, and no
hosted deployment is implied. Next investigation: duplicated financial evidence
loads within the locked reviewed-return execution, preserving all provenance and
accounting checks rather than removing review guarantees.

## Unused-relation pruning retry

Run296009b0-b24c-471f-bc87-18a95e593245, baselinee4f08a3d plus removal of unused
historical fulfillment inventoryUnit and prior financeCost valuationEvent relations.
20focusedtests56assertions and scoped source TypeScript passed before execution.
The financial retry still failed at valuation financeBook.findUnique after34611ms:
0pass1fail16assertions191.80s. Cleanup verified, process exited1. No DB process live.
Log:`artifacts/assistant-operations-web/d03-return-financial-pruned.log`.

This pruning does not remove any validator field access or claim timeout resolution.
Current-return movement inventoryUnit and saved valuationEvent remain loaded. The
same failed stage after pruning shows that further repeated evidence loading must be
addressed across locked review and execution; any reuse must be transaction-bound,
retain canonical provenance checks and account for writes within that transaction.

## Evidence-reuse verification attempt — fixture failure

Runbcce9ccd-63ee-4a2b-87fd-8f1168815525 on committed0d66660b failed before reaching
reviewed return execution. Fixture order creation expired at stockReservation.findUnique
in catalog-inventory.ts after32810ms/30000ms. Result0pass1fail3assertions94.39s.
Cleanup verified; process8320 exited1. No live DB suite remains.

Log:`artifacts/assistant-operations-web/d03-return-financial-reuse.log`.
This is not evidence for or against the locked source-reuse optimization; its
financial acceptance remains unverified. The test now traces fixture order creation
and each return command separately. The local runner enables existing pool/SQL
instrumentation so those stage traces can distinguish transaction acquisition from
query work. Syntax bundle and diff check pass; instrumentation has not been rerun.
No timeout change or production workaround was made.

## Stage-traced reviewed return attempt

Run `3e3a6d40-3d79-412a-a39d-26058f8b3225`, source `36f6f7eb`.
Result: **fail**, 0 passed / 1 failed / 16 assertions, 179.63 seconds.
Fixture Order creation succeeded in 12.674 seconds (52 SQL calls; pool wait
0.826 ms). The reviewed return reached journal source resolution and expired at
`inventory-return-posting-source.ts` FinanceBook lookup after 33,744 ms against
the unchanged 30,000 ms limit. Command trace: 33.756 seconds, 131 SQL calls,
0.129 ms pool wait, four locking SQL calls totaling 956.510 ms. Aggregate SQL
phase timings overlap and must not be interpreted as wall-clock duration.

Cleanup was verified; session 73475 exited 1. Log:
`artifacts/assistant-operations-web/d03-return-financial-stage-traced.log`.
No database suite remains from this run. This shows execution reached the journal
stage; it does not prove committed cost or journal effects. Next investigate the
repeated current-return and original gross-cost graphs in journal resolution,
retaining provenance, prior-return ceilings, account and closed-period checks.
Do not rerun the unchanged acceptance suite or increase its transaction timeout.

Additional focused regression: a foreign entered unit on the newly created stock
movement is rejected even when prior source history is reused. The one-use token
is consumed on failure and no valuation event is written. Valuation suite:
15 tests passed / 51 assertions. This is deterministic unit evidence, not financial
DB acceptance, live-model evaluation or browser acceptance.
