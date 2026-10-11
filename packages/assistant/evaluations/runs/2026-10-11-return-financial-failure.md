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
