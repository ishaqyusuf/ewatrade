# Purchase stock preparation bounds — 12 October 2026

Evidence: provider-free source/unit checks, isolated QA database preparation,
reviewed canonical receipt rollback and actual dashboard object Open/Close.
E05 remains partial; this does not certify full ten-line posting or a model run.

Reviewed receipt confirmation now uses one bounded fresh stock preparation for
1–10 distinct original goods instead of repeating the same source/label reads for
every line. Book lock precedes sorted Tenant/Store stock locks. Entered units and
configuration rows are locked with tenant attribution and exact expected pairing.
All sources must be present, have Store custody and use current compatible Product
units. Shared canonical quantities and packaged entered quantities remain distinct.
Source/quantity/unit/revision binding, command hash, memoized execution and stock
CAS reuse the existing writer. The entire review digest still compares before
financial or stock effects. No supplied graph, cache across transactions, root
work within transactions, nested transaction, timeout increase or public change.

Focused17 tests/234 assertions pass, covering maximum ten mixed lines, fixed six
preparation database calls, scoped/sorted complete locks, unsupported bounds,
conflicting repeated-unit configurations, absent/foreign/stale/incompatible sources,
precision refusal, exact quantities, caller input mutation, one execution and CAS.
These are six API/database calls, not six underlying Prisma SQL statements.
Affected source/test TypeScript exits0. No broad or mobile checks were run.

The first database launch was terminal before its first query could reach the
server in the sandbox. The network-capable run verified exact ewatrade_qa_v1,
classified QA tenant, exact Owner/email, Store and existing Book. The retained
marked fixture is one draft Product with ten variants and two current units:
bag factor1 (five shared pools) and crate factor12 (five packaged balances).
Existing receipt preparation runs under the Book lock and unchanged10s/30s limits.
One-line preparation takes3135.441ms; ten takes3111.359ms. Each exact original
revision0, Product label,2.125entered quantity, canonical effect2.125/25.5 and
resulting source quantity2.125/4.125 is checked. All checked commands/journals/
receipts/valuations/movements/stocks before and after agree; no posting is attempted.
Fixture creation is retained QA data, separate from those read-only checks.

The changed reviewed receipt command was then exercised against the already saved
QA supplier's two-line agreement (2.375bags/1200minor and1bag/100minor). Advisory
whole review supplies the digest; confirmation independently rebuilds the review
under locks, posts exact movement/valuation facts and then deliberately rolls back.
Final verification completes22909.358ms inside30s, including saved source quantity,
unit, acquisition cost and .123 timestamp readback.66 traced database calls;
all checked saved command/journal/event/receipt/valuation and14Store balances are
unchanged. This is canonical composition evidence; the surrounding assistant
proposal claim/completion and full ten-line command are separate operating gates.

The first attempt reached the command return but its verification used the wrong
receipt field (recognitionId). It failed and rolled back at23187.514ms; not a pass.
The test query was corrected to original billLineIds, and the naturally completed
retry passed. Both JSON reports/logs are retained. The nonfatal pg concurrent-query
deprecation warning remains recorded; no claim about its cause or resolution.

The saved QA goods object opens through catalogDetail over /assistant. The actual
sheet shows all ten sources, their bag/crate balances and zero reservations.
Close restores /assistant with the existing saved supplier/agreement chat and100/100
allowance. Screenshot: artifacts/assistant-operations-web/
e05-ten-line-goods-overlay-web.jpg. Temporary owned tab40 closed; user tab preserved.

Raw artifacts: e05-stock-bounds-fixture.json, e05-stock-bounds-preparation.json,
e05-stock-batched-reviewed-rollback.json and its initial failed report. Commands:

```
bun test packages/db/src/queries/prepared-purchase-stock.test.ts packages/db/src/queries/finance/purchase-receipt-review.test.ts packages/db/src/queries/finance/purchase-recognition-receipt-source.test.ts
node artifacts/assistant-operations-web/run-recognition-web.mjs purchase-stock-bounds.ts
node artifacts/assistant-operations-web/run-recognition-web.mjs purchase-stock-reviewed-rollback.ts
```

Next: batch per-line stock/category/receipt and valuation writes while retaining
actual saved source provenance, then verify the complete ten-line assistant receipt
transaction within30s. Larger bounds, signed stale-source and operational acceptance
remain open. No cleanup, provider/model call, schema/migration, mobile, push or deploy.
Roadmap13/45 accepted(28.9%),32/45 awaiting acceptance(71.1%); goal active.
