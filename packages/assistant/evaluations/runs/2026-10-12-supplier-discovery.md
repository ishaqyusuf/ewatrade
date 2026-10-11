# Supplier and purchase discovery — 12 October 2026

E05 progress, not whole-ticket acceptance. The web roadmap remains 13/45 accepted
(28.9%), 32/45 awaiting acceptance (71.1%). These are provider-free deterministic
tool and manual web checks; no live-model conversation or hosted rollout is claimed.

## Implementation

Dashboard Owner/Admin supplier search, supplier statement, purchase bill list/detail
and purchase agreement list/recognition detail are source-available. The existing
money-account read is also source-available to resolve funding in the returned Book.
Supplier search v2 accepts a name/code without an internal Book identifier and uses
the canonical current-business Book read. Every successful search returns bookId,
including an empty result. Continuations require an explicit Book and retain the
original query. Page bounds, tenant/role/plan authority and statement snapshots are
unchanged. This read does not create a Finance Book or any business record.

Settlement instructions resolve supplier, invoice, original advance and funding
account through authorized reads. They ask about completed payment/allocation in
ordinary language rather than asking the merchant for internal IDs or schema flags.
The committed money-account dependency retains its explicit-Book v1 input; an
unrelated optional-Book v2 change in the shared working tree is excluded.

## Actual tool/database checks

The retained `verifySupplierPurchaseDiscovery` helper invokes the real
`createGeneralTools` executors against an actor-owned GENERAL QA conversation and
classified tenant Book. The profile runner checks the exact non-production QA
database, actor, tenant and Store. It does not invoke a model or persist answer cards.

| Actual call | Verified result |
|---|---|
| Supplier search, no bookId | Exact original supplier and canonical bookId |
| Unmatched supplier search, no bookId | Empty list and the same canonical bookId |
| Supplier statement | Payable 550 minor, unallocated advance 400 minor; original advance entry retained |
| Partial purchase bill list | Exact original invoice, outstanding 550 minor |
| Purchase bill detail | Cash 250 minor, active advance allocation 300 minor, outstanding 550 minor; original agreement and advance linkage |
| Purchase agreement list | Exact original agreement |
| Recognition detail | Independent active INVOICE, OWNERSHIP and RECEIPT events; original invoice linkage |
| Money accounts, explicit Book | Exact original Shop cash account |
| Four missing Book/target reads | Supplier Book, statement supplier, invoice and agreement return unavailable |

All 12 reads passed; 10 answer callbacks were collected. Before/after facts were
identical: one Book, six journals, fourteen commands, six proposals and all four
Store stock rows with their exact quantities, reservations and revisions. Stock
quantities were 30, 12, 2.125 and 1; reservations remained zero. This is not proof of
all revoked-role, cross-tenant, multi-page or signed stale-source database scenarios.

Initial scoped compilation caught an incorrect QA conversation guard field; it was
corrected to ownerUserId/purpose before the database run. Ten focused tests across
four files passed with 97 assertions. After adding the continuation Book guard, the
supplier-only check passed two tests/16 assertions. These repeated checks are not
summed. The focused existing funding/customer-read authority test passed one
test/28 assertions, including Owner/Admin, other roles and the Free plan. Its
compatible funding-availability expectation accompanies the source rollout. Final
scoped affected API/helper TypeScript completed with exit 0.

The real reader wrote verified results and disconnected, but imported runtime
handles kept its CLI alive. Only that verified, disconnected child was stopped;
the original run is not reported as a natural exit 0. The standalone local runner
now explicitly exits after awaited disconnect. Its imports/disconnect-only lifecycle
check exited 0 without rerunning the database assertions. The idle-handle root cause
is not established.

## Actual dashboard objects

The saved supplier statement was inspected over `/assistant`: QA ACME Supplies,
payable ₦5.50, unallocated advance ₦4.00 and original posting history. Close retained
the existing chat. Actual Open on the completed payment card displayed the same
invoice with total ₦11.00, cash ₦2.50, advance applied ₦3.00, settled ₦5.50 and
remaining payable ₦5.50, plus its original agreement/history link. Close retained
the same chat and unchanged 100/100 allowance. The owned temporary tab was closed.

Screenshots and detailed local results:

- `artifacts/assistant-operations-web/e05-supplier-discovery-statement-web.jpg`
- `artifacts/assistant-operations-web/e05-supplier-discovery-invoice-web.jpg`
- `artifacts/assistant-operations-web/e05-supplier-discovery.json`

## Remaining acceptance

E05 remains partial and unbookmarked. Supplier creation/purchase registration
activation and full chat acceptance, larger physical receipt operating bounds,
full signed stale-source/operational acceptance and live-model evaluation remain
separate requirements. No mobile work, provider call, schema/migration, timeout
increase, fixture deletion, push or deployment occurred.
