# Ten-line purchase stock and valuation writes — 12 October 2026

Evidence: provider-free query/unit checks, canonical isolated QA commands, complete
signed assistant confirmation rollback/stale-stock probes and saved dashboard
agreement Open/Close. E05 stays partial and unbookmarked; no model run or rollout.

Following batched fresh preparation, reviewed confirmation now posts all original
stock commands together. Shared command validation binds Tenant/Store, source,
quantity, unit/configuration, revision, source/type and no optional unit price.
Every original must occur exactly once with a distinct stock identity and one
actor/date. The batch copies command/date/categories, hashes the whole set and
memoizes one execution. Exposed preview objects are not write authority.

One scoped identity check rejects existing operations outside the parent command.
Category ID lookup and native sorted named upsert happen once, preserving each
line's original deduplicated order. Up to10×10 categories are supported. One raw
balance CAS verifies Tenant/Store, revision, prior quantity/reservations, Product,
unit, kind and Store custody; complete returned IDs are required. updatedAt is
maintained. Operations/category links/movements and original Finance receipt rows
use bounded createMany. Actual saved operations/movements are reread and checked
for exact identities, actor/date, quantities, factor/scale, categories and absence
of optional cost snapshots before valuation.

Valuation retains actual complete receipt/owner/journal/date proof. One pool read
and grouped movement count supply the unchanged pure arithmetic for every original.
Every source is validated before pool effects. Existing pools update in one scoped
CAS, comparing old quantity/value/UNKNOWN reason, stock revision, history count,
sequence and effective date; complete returned IDs are required. New pools and
immutable events use createMany. Actual saved events and pools are reread and checked
for source, quantity, cost, carrying value/status, sequence, current revision/history
and date. Completed event replay preserves original facts without pool reads/writes.
The ordinary/legacy single valuation writer shares the same source checks and keeps
its independent owning path. No authority, source proof or monetary rule is weakened.
No nested transactions, root work inside transactions or timeout increase.

Focused35 tests/497 assertions pass across prepared stock, category groups, whole
receipt review, actual owner-source proof, receipt valuation and impact arithmetic.
Tests include ten mixed sources, maximum100 names, complete/foreign category IDs,
source replacement, bounds, actor/date mixing, preview mutation, concurrent memoized
execution, changed command hash, stale/partial CAS responses and missing/changed saved
facts. Known zero opening, sequential known pools, positive packaged UNKNOWN opening,
net-zero uncosted gaps, dated owner refusal and completed valuation replay remain
covered. Affected source/test TypeScript exits0. No broad or mobile validation.

Exact ewatrade_qa_v1, classified QA tenant, Owner/email, Store and original Book
are verified by all retained runners. A new marked agreement registers ten retained
QA stock sources (five shared bags, five packaged crates) with2.125 entered quantity,
100minor cost and ten unique category selectors per line. Registration adds one
agreement/private cost document/command; it creates no invoice/payable/journal/stock.
These retained fixture changes are separate from each rollback's before/after proof.

Stock-only batching with per-line valuation completed in27151.747ms (88 traced calls).
After valuation batching the same ten-line reviewed command plus actual saved proof
completed19499.020ms (53 calls). Ten exact movements are checked: shared0→2.125bag,
packaged2→4.125crate with canonical effect25.5, exact source cost100each and .123 date.
Five zero-opening pools are KNOWN value100; five positive uncosted openings retain
MISSING_OPENING_COST and null carrying value. Deliberate rollback leaves all checked
saved financial and stock facts unchanged. The separate existing-pool two-line receipt
also completes20392.369ms with exact acquisition cost/unit/date readback and rollback,
exercising the real pool CAS against existing known pool values.

Full GENERAL proposal proof uses the actual Owner session, current authority/privacy/
age/legal checks, Serializable10s/30s transaction, real strict draft and signed token.
Draft succeeds in29506.692ms: advisory per-line stock previews remain near the30s
limit and must be batched next. Full confirmation reaches the actual COMPLETED update
in23149.540ms; the test reads all ten saved movement/valuation records and100actual
category links there, then deliberately throws to roll back claim, effects and
completion. Exact stock/financial/pool/category counts and PENDING revision1 proposal
remain unchanged. A separate transaction-local stock revision change with the same
signed token refuses in12201.923ms with CONFLICT/Review again before completion; all
setup/claim/business effects roll back. No signing key/token is retained in reports.

The saved ten-line agreement opens through the global purchaseRegistration sheet over
/assistant. Actual agreement total10.00, all ten original goods and precise agreed date
are rendered; retained history has no invoice/ownership/receipt events after rollback.
Close preserves assistant chat and100/100 allowance. Screenshots:
artifacts/assistant-operations-web/e05-ten-line-agreement-over-assistant-web.jpg and
 e05-ten-line-agreement-history-web.jpg. Owned temporary tab41 closed; user tab kept.
This is agreement inspection, not successful maximum receipt browser confirmation.

Retained raw reports: e05-stock-ten-line-reviewed-stock-only-rollback.json,
e05-stock-ten-line-reviewed-rollback.json, e05-stock-batched-reviewed-rollback.json,
e05-ten-line-assistant-bounds.json and e05-stock-bounds-fixture.json. The pg concurrent
query deprecation warning is nonfatal and retained. All own runs are terminal.

Next: batch advisory stock preview reads (29.5s draft leaves little headroom), load
current code in the owned local API, complete maximum receipt browser Edit/re-review/
Confirm/Open/Close and verify persisted recovery. Broader E05 stale/operational
acceptance remains separate. No fixture deletion, provider/model call, schema/migration,
mobile, push or deployment. Roadmap13/45 accepted(28.9%),32/45 awaiting(71.1%). Goal active.
