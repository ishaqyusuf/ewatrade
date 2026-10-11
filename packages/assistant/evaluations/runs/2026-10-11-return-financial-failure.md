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
