# Direct purchase — canonical review and batched posting

12 October 2026. Canonical `finance.recordPurchase` backend milestone only. The
assistant action/editor and signed/saved dashboard acceptance remain pending.
E05 stays partial and unbookmarked; roadmap13/45 accepted28.9%,32 awaiting71.1%
(11partial,20pending,1deferred mobile A04). Full45-ticket goal remains active.

Native normalization was extracted unchanged into a shared module. Fresh advisory
and Book-locked preparation share authority, same-Book supplier, authenticated
Store/currency, date/period and active typed Inventory1300/Payable2000 source checks.
The complete digest binds original financial inputs/labels, every goods unit/config/
revision/category, observed movement history and valuation pool provenance/effects.
Prepared allowed inputs/dates/categories and source proof remain private, with one
command key. Public review stock objects are copied and cannot mutate private proof.

Canonical posting uses the existing sorted, batched stock preparation and writer,
batched bill lines/receipt links, and a dedicated direct-purchase valuation wrapper.
That wrapper accepts only actual PURCHASE receipts of the newly created original
bill, exact Book-owned bill/line/account and actual original actor, and derives dates
from the saved owning bill. Registered PURCHASE_ACCRUAL receipts still require their
original dated recognition owner. Shared known/packaged/unknown-gap arithmetic,
optimistic pool updates and saved event completeness/source checks are retained.
The native RECORD_PURCHASE identity, payload, stock identities, journal source and
supplier credit remain; no caller proof, nested/root-inside transaction or timeout
increase was introduced (maxWait10s/timeout30s).

## Verified evidence

- 13 focused tests/290 assertions pass, covering normalization/full ten goods and100
 categories/capped totals, authority/scope/currency/period/typed controls, review
 effects/digest/private review isolation, direct original-bill/date/actor provenance,
 registered/direct separation, valuation arithmetic and exact completed replay.
- Exact `ewatrade_qa_v1`, owned classifiedQA Tenant/active Owner/Book/Store/supplier and
 ten existing mixed shared/packaged sources verified. Current revisions were freshly
 loaded; new purchase/category effects occur only inside forced rollback.

| Goods | Categories | Advisory review | Full canonical transaction + replay/readback |
|---|---|---|---|
|1|10|5.521s|18.787s|
|10|100|5.440s|18.869s|

Each case verifies complete original bill/line positions and amounts, all receipt/
stock-operation/movement/category links and unit conversions, valuation cost/date/
sequence/known or unknown effects/pool revision/history, exact balanced original
journal and supplier credit, native replay/changed command refusal, memoized execution,
other-key refusal and protection from caller input/date/category mutation. Forced
failure preserves every saved Book/bill/command/journal/journal-line/account total/
supplier entry/receipt/valuation/pool/Tenant stock operation/source/category fact.
Suite87443 exited0. Log `/private/tmp/e05-direct-purchase-rollback.log`.

Four real authentic-digest stale-source probes refuse with CONFLICT before posting:
- supplier-label: 7.289s.
- stock-revision: 7.263s.
- pool-sequence: 7.248s.
- category-resolution: 7.253s.
All four source mutations and any attempted effects roll back; exact saved facts
remain unchanged. Suite28157 exited0, log `/private/tmp/e05-direct-purchase-refusals.log`.

The initial sandbox connection failed before any database work. The approved exact
QA retry rolled back safely but its raw SQL JSON timestamp assertion initially
parsed timezone-free UTC as local time. Only test parsing was corrected to explicit
UTC; the succeeding suite proves actual subsecond dates. No posting-date change.
Existing nonfatal pg concurrent-query deprecation was observed; no cause/fix claimed.
Scoped affected source/test/helper types pass; final session37055 exited0.
No broad/repeated suite, schema/migration, mobile, provider/model, fixture deletion,
runtime restart, source activation, push or deployment was performed.

Local raw JSON reports and a static canonical-review HTML evidence object are retained
under `artifacts/assistant-operations-web/`. Browser policy blocked the local file
protocol, so no screenshot of that evidence object is claimed. No new dashboard
acceptance or screenshot is certified by this backend milestone. Prior supplier-entry
reversal promotion/API restart still awaits the previously requested approval after
automatic review rejection; no retry or workaround was performed.

Next: implement the strict direct-purchase assistant proposal and dashboard editor,
then authentic signed/saved web acceptance of the full1–10 line scope. The three E05
procedures remain unchecked. Fixture, run catalog, ticket board and Brain impact updated.
