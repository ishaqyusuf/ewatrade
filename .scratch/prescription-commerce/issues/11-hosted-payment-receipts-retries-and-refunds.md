# 11 - Hosted Payment, Receipts, Retries, And Refunds

**What to build:** Add a scoped Review & pay experience for accepted prescription orders using provider-hosted checkout, signed asynchronous callbacks, an auditable payment ledger, and safe retry, receipt, balance, and refund behavior.

**Blocked by:** 09 - Prescription Quote To Pickup Order

**Status:** implemented-source; Paystack canary pending

- [ ] Review & pay appears only after the customer has selected fulfilment and the exact payable total is fixed.
- [ ] Checkout uses a provider-hosted payment route and never collects raw card data in EwaTrade forms, logs, or storage.
- [ ] Payment intents and webhook events are tenant/store/order scoped, signature verified, replay resistant, and idempotent.
- [ ] Pending, paid, failed, expired, partially refunded, refunded, and payment-retry states have explicit order and ledger behavior.
- [ ] Duplicate or out-of-order callbacks cannot overpay, double-reserve, or move an order backward.
- [ ] Customers receive a neutral receipt/status view showing amount paid, remaining balance where allowed, and refund outcome without prescription details.
- [ ] Staff can initiate authorized refunds with reasons and audit history within provider and role constraints.
- [ ] Provider fakes and integration tests cover checkout creation, return polling, webhook races, retries, mismatched amounts, and refunds.
