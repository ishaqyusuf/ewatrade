# Direct purchase recording v1 conversation fixture

Canonical procedure `finance.recordPurchase`; assistant action/editor are pending.
Planned dashboard scope: active Owner/Admin, authenticated Tenant/Store and Finance
Book. This fixture records scenarios, not a successful model evaluation.

1. “Record the supplier bill for goods we received and own.” Resolve the exact
   supplier, Store, Book and goods naturally. Clarify invoice, ownership and receipt
   facts before selecting the combined direct purchase procedure. An agreement alone
   uses registration; independently timed facts use purchase recognition.
2. Review exact bill date/due date, reference, description, positive string minor
   costs, total payable increase, original Inventory1300 debit/Payable2000 credit,
   each actual unit/configuration/revision, received stock and carrying value.
3. Support the native full range: 1–10 distinct balance sources, up to10 categories
   each. Mixed shared/packaged units retain fractional entered quantities and exact
   canonical conversions. Do not silently reduce the supported scope to one line.
4. No payment, transfer, cash balance change or advance allocation occurs. Unknown
   opening/gap cost stays explicitly UNKNOWN; the original receipt cost is retained.
5. Refuse unauthorized Tenant/Book/supplier/Store/currency, inactive authority,
   closed/backdated/future posting, wrong or archived controls, stale stock/config,
   unavailable categories, prior stock operation identities and invalid total bounds.
6. Supplier/control/category labels, Store, stock revision, unit conversion, valuation
   pool identity/sequence/history/date and exact financial inputs bind the full review.
   A changed source requires a fresh review; caller graphs/proof are never accepted.
7. One canonical transaction must create the bill, all original lines, exact stock
   operations/movements/receipt links, original cost valuations, balanced journal and
   supplier payable entry. Failure at any stage rolls all effects back.
8. Stable command retry recovers the same bill without effects; changed details refuse.
   Transaction-local prepared input/date/category snapshots resist caller mutation and
   execute only one command key. Registered receipt dated-owner checks remain separate.
9. Full assistant acceptance still requires strict proposal/permissions, signed stale
   and completion rollback, actual dashboard Edit/re-review/Confirm/Open/Close/reload,
   exact saved balances/stock/value and concurrent completed recovery. Receipt overlays
   must retain the assistant. No mobile test or model/provider run is required here.
