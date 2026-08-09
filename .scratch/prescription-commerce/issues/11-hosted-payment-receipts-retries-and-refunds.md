# 11 - Hosted Payment, Receipts, Retries, And Refunds

**What to build:** Add a scoped Review & pay experience for accepted prescription orders using provider-hosted checkout, signed asynchronous callbacks, an auditable payment ledger, and safe retry, receipt, balance, and refund behavior.

**Blocked by:** 09 - Prescription Quote To Pickup Order

**Status:** implemented-source; Paystack canary pending

**Verification note (2026-08-09):** hosted checkout is gated by an accepted
fulfilment Quote and fixed Commercial Order total. Paystack signature parsing,
provider-hosted URLs, Tenant/Store/Order intent scope, event identity/payload
replay, monotonic paid/failed/refund transitions, refund locking/reconciliation,
and neutral status projections are covered by focused tests. Expired checkout
is derived from its authoritative expiry without exposing Order or prescription
data; mismatched amount/currency callbacks are rejected before ledger facts.
The verified Neon origin matrix covers checkout, paid callback/replay, receipt
intent, status polling, and downstream fulfilment. Live Paystack canary remains
an external release gate.

- [x] Review & pay appears only after the customer has selected fulfilment and the exact payable total is fixed.
- [x] Checkout uses a provider-hosted payment route and never collects raw card data in EwaTrade forms, logs, or storage.
- [x] Payment intents and webhook events are tenant/store/order scoped, signature verified, replay resistant, and idempotent.
- [x] Pending, paid, failed, expired, partially refunded, refunded, and payment-retry states have explicit order and ledger behavior.
- [x] Duplicate or out-of-order callbacks cannot overpay, double-reserve, or move an order backward.
- [x] Customers receive a neutral receipt/status view showing amount paid, remaining balance where allowed, and refund outcome without prescription details.
- [x] Staff can initiate authorized refunds with reasons and audit history within provider and role constraints.
- [x] Provider fakes and integration tests cover checkout creation, return polling, webhook races, retries, mismatched amounts, and refunds.
