# 12 - Pickup Preparation And Handoff

**What to build:** Give pharmacy staff a pickup fulfilment workflow covering packing checks, readiness, customer notification, authorized collection, secure pickup-code verification, final handoff, and recoverable exceptions.

**Blocked by:** 11 - Hosted Payment, Receipts, Retries, And Refunds

**Status:** implemented-source; production acceptance pending

- [ ] Eligible paid pickup orders enter a store-scoped preparation queue with immutable order and item snapshots.
- [ ] Required packing checks and authorized staff confirmation must pass before an order becomes ready for pickup.
- [ ] Ready status creates a neutral notification and customer status action without disclosing prescription contents.
- [ ] Pickup codes are random, scoped, expiring or lifecycle-bound, stored as digests, rate limited, and never exposed in logs.
- [ ] Staff can verify the customer or an explicitly authorized collector before recording handoff.
- [ ] Missing items, damaged items, incorrect collector, abandoned pickup, cancellation, and refund/escalation paths are explicit and audited.
- [ ] Duplicate commands or concurrent staff actions cannot hand off an order twice or reverse a completed handoff.
- [ ] Queue, permission, notification, code-security, exception, and end-to-end pickup tests are included.
