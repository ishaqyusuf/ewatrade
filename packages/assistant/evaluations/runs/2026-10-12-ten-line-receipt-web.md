# Maximum purchase receipt draft and dashboard — 12 October 2026

Evidence kinds: deterministic integration and manual web; provider/model not applicable.
Exact isolated local QA profile, classified QA Tenant, original Owner/Store/Book and
retained marked ten-goods agreement. No mobile, provider call, deletion, push or deployment.

## Advisory stock source batching

`getFinancePurchaseReceiptReview` now loads original 1–10 distinct stock sources in
four fixed model reads (balances, entered units, canonical labels, item names).
This is not a claim about underlying SQL statement count. Advisory and locked stock
preparation share private source loading, exact arithmetic and Tenant/Store/Product,
custody/current configuration/entered-unit guards. Advisory returns previews only:
no locks, command closure, caller-provided graph, cross-review cache or write.
Confirmation still takes original sorted source/unit locks, reloads fresh source facts,
compares the complete review digest and uses the owning atomic receipt command.
No payload, permission, schema, transaction limit or source authority changed.

30 focused tests / 467 assertions pass, covering shared/packaged math, fresh revision,
missing/foreign source, unit ownership/current configuration, custody, quantity scale,
complete receipt/category/valuation/review guards and prepared execution proof.
Affected source/test compiler passes; no broad workspace checks.

Full GENERAL Edit review reaches its proposal-write boundary in **11,557.810ms**,
versus prior full draft **29,506.692ms**. This is different operation timing (Edit
versus initial draft), both including the same canonical receipt preparation and
fresh GENERAL authority. Deliberate failure before proposal update rolls back:
all checked financial/stock/category facts unchanged, PENDING revision2/payload hash
unchanged. The prior one-line/ten-line fixed-call unit comparison verifies scaling.
These are single observed runs, not a latency distribution or load benchmark.

Local artifacts: `e05-ten-line-draft-batch.json`, `/private/tmp/e05-ten-line-draft-batch.log`,
`/private/tmp/e05-advisory-batch-tests.log`, `/private/tmp/e05-advisory-source-tests.log`,
`/private/tmp/e05-advisory-batch-types.log`.

## Dashboard execution

Owned non-hot local QA API was gracefully reloaded to use current source. Actual
assistant Edit changes the source reference, requires a new physical-arrival
acknowledgment and saves revision2. Re-review preserves exact ten original sources,
2.125 entered quantities, 100 original category names, factor12 packaged conversion,
known empty shared values and UNKNOWN packaged opening cost. The date retains .123
milliseconds. Source reference is `QA-TEN-LINE-WEB-RECEIPT`; no money is sent.
Screenshot: `e05-ten-line-receipt-review-web.jpg`.

Actual signed Confirm completes revision2. Exact readback proves ten stock movements,
ten receipt allocations, ten valuation events/pools and 100 original category links.
Shared stock0→2.125 bags with100 minor carrying value; packaged stock2→4.125 crates,
canonical24→49.5, source cost100 minor, UNKNOWN/MISSING_OPENING_COST stays explicit.
Every saved stock revision is1, reserved quantity0, original units/configuration/
category order and original Owner/.123 receipt date match. One new journal debits
1300/credits2050 for1000 minor. Supplier entry count4 and invoice count1 are unchanged.

Book command count17→19 consists of exactly the original proposal's receipt command
and its hashed recognition-journal command, with the original Owner and native kinds
RECOGNIZE_REVIEWED_PURCHASE_RECEIPT/POST_JOURNAL. Journal count6→7. Two concurrent
completed decisions recover the same saved receipt and leave all recorded counts and
stock snapshots unchanged. Actual Open shows all ten recorded goods and receipt
history in the global sheet over `/assistant`; Close returns to the same chat.
Reload recovers the saved completed receipt, with the chat allowance still100/100.

Initial readback harness incorrectly expected one command instead of the owning
receipt+journal pair (terminal failure); corrected harness then referenced a nonexistent
StockMovement.effectiveAt instead of StockOperation.effectiveAt (terminal failure).
Both logs are retained; neither is a product pass. Corrected verifier has scoped
TypeScript success and a terminal successful run with exact command identities and
native operation date. No confirmation was repeated to correct the harness.

Local evidence: `e05-ten-line-browser-before.json`, `e05-ten-line-browser-verification.json`,
`/private/tmp/e05-ten-line-browser-final-verify.log`,
`/private/tmp/e05-ten-line-browser-verify.log` (failed harness),
`/private/tmp/e05-ten-line-browser-verify-corrected.log` (failed harness),
`/private/tmp/e05-ten-line-browser-verifier-types.log`.
Screenshots: `e05-ten-line-receipt-completed-web.jpg`,
`e05-ten-line-receipt-over-assistant-web.jpg`, `e05-ten-line-receipt-history-web.jpg`,
`e05-ten-line-receipt-persisted-web.jpg`. Temporary owned tab closed; user tab retained.
Confirmation latency was not precisely captured in this browser run; prior signed
rollback timing remains separate evidence. All own processes are terminal.

E05 remains partial/unbookmarked. Roadmap13/45 accepted (28.9%),32/45 awaiting
acceptance (71.1%); broader signed stale-source and operational acceptance remain
separate from maximum web-path proof. The full goal remains active.
