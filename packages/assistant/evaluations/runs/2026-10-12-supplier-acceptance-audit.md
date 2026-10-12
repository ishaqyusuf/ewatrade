# Supplier acceptance audit — 12 October 2026

E05 remains partial and unbookmarked. The roadmap has 13/45 accepted milestones
(28.9%); 32/45 await acceptance (11 partial, 20 pending, one mobile deferred).

## Real signed receipt refusal evidence

The versioned `general-purchase-receipt-guards.integration-check.ts` helper was run
against a caller-owned, classified QA tenant in `ewatrade_qa_v1`. It uses the actual
`decideGeneralProposal`, a fresh revision-2 signed receipt proposal and the original
two-line purchase agreement. Each setup change happens inside the same transaction
as the attempted confirmation and rolls back. Unexpected successful confirmation
throws before commit and fails the probe. Setup changes are test fixtures, not a
production lock-order example. The transaction budget remains 30 seconds.

| Probe | Refusal | Observed milliseconds |
|---|---|---:|
| Changed signed token | CONFLICT | 3266 |
| Valid token for old revision | CONFLICT | 3262 |
| Owner role revoked to Cashier | FORBIDDEN | 3542 |
| Session expired | UNAUTHORIZED | 1438 |
| Accounting period closed | CLOSED_PERIOD | 4729 |
| Original purchase control account archived | CONFLICT | 8168 |
| Original inventory configuration retired | STALE_CONFIGURATION | 11082 |
| Reviewed category display label changed | CONFLICT | 12065 |
| Reviewed valuation pool amount changed | CONFLICT | 12087 |

All nine probes passed; runner terminal exit 0. After each probe the helper compared
fresh saved proposal status/revision/digests/result, Book sequence/cutoff, authority,
session, accounts, categories, configuration, balances, pools and financial/stock
effect counts. All were unchanged. The QA draft remains pending at revision 2;
fixtures were retained. This is direct confirmation evidence, not a live model run.
These timings are individual observations, not a load benchmark.

## Shared boundary evidence and limits

`general-supplier-access.test.ts`, `proposal-security.test.ts` and
`legal-session-access.test.ts` passed together: 9 tests, 181 assertions, zero failures.
The twelve implemented E05 capabilities allow Owner/Admin and refuse Manager,
Cashier, Operator and scoped Manager, plus Free plan, suspended access and an
inaccessible Store assignment. Signature tests cover proposal/revision/payload,
Tenant/Store/actor and expiry binding. Legal tests exercise the shared publication
and exact acceptance gate; they do not prove production legal transport, which is
bypassed by the local QA environment. These pure policy tests are separate from
the real database probes above.
The affected helper and policy test typecheck also completed with exit 0.

## Unaccepted canonical procedure checklist

- [ ] `finance.recordPurchase`: direct received purchase recording.
- [ ] `finance.recordSupplierOpening`: opening balances distinct from new money.
- [ ] `finance.releaseSupplierAllocation`: next assistant implementation.
- [ ] `finance.reversePurchasePayment`.
- [ ] `finance.reversePurchaseRecognition`.
- [ ] `finance.reverseSupplierEntry`.

The canonical finance router/inventory already lists these procedures; existing
registered agreement, independent recognition and payment flows do not establish
their assistant acceptance. Each needs an adapter, exact review, owning receipt,
relevant fresh refusal/rollback/recovery proof and web acceptance. The full per-ticket
matrix in the canonical Brain plan also remains required; this report does not
certify every matrix row for every action.

An isolated committed-HEAD coverage generator attempt failed with four existing
unclassified order procedures: `orders.timeline`, `orders.changeOptions`,
`orders.refund`, `orders.returnItems`. No generated coverage artifact was replaced
and H01 remains partial. No mobile testing, model/provider call, schema change,
fixture deletion, push or deployment occurred in this audit.
