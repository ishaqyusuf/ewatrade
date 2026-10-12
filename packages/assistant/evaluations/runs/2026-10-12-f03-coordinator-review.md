# F03 payout research coordinator review — corrections required

The research starts F03 but does not establish merchant transfer entitlement,
approved payout policy or an implemented domain. No provider account, credential,
sandbox or live API was accessed. The coordinator checked current primary
documentation on 12 October 2026.

1. The packet's claim that duplicate-reference behavior is undocumented is
   contradicted by the current [Single Transfers documentation](https://paystack.com/docs/transfers/single-transfers/):
   Paystack documents using the same reference when retrying an inconclusive
   request to avoid double crediting, and treats a new reference as a new request.
   Persist the reference and reconcile by it; correct the research claim and
   distinguish documented behavior from guarantees not yet exercised in sandbox.
2. The [How Transfers Work status table](https://paystack.com/docs/transfers/how-transfers-work/)
   also defines `received`, `blocked` and `rejected` for merchant URL approval.
   The proposed state model omits these. Record their mapping and authority
   semantics, including a nonterminal approval request and terminal refusal or
   missing approval response. Do not collapse them into successful settlement.

The safety-preserving design remains: an unknown outcome never starts a fresh
intent/reference, received events remain durable, and authoritative settlement
controls postings. Same-reference retry policy still needs the reviewed F04/F05
dispatch and reconciliation design; documentation is not an executed duplicate
transfer test. No retry or approval setting was changed by the coordinator.

Remaining review scope: independently reconcile country/currency eligibility,
current fees, limits, funding and verification pricing; merchant account facts;
approved role/step-up/limit/purpose/fee/key-custody policies; complete beneficiary,
payout and reconciliation contracts. The packet already flags conflicting pages
and unresolved decisions. Those remain requirements, not accepted defaults.

F03 stays partial and unbookmarked. F04 live or sandbox execution is not
authorized by this source review. Overall web acceptance remains 13/45.
