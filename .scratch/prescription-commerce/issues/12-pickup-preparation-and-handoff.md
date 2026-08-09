# 12 - Pickup Preparation And Handoff

**What to build:** Give pharmacy staff a pickup fulfilment workflow covering packing checks, readiness, customer notification, authorized collection, secure pickup-code verification, final handoff, and recoverable exceptions.

**Blocked by:** 11 - Hosted Payment, Receipts, Retries, And Refunds

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** the paid Store queue, packing gates,
neutral ready intent/status, encrypted-and-digested expiring pickup code, failed-
attempt lockout, collector record, exception transitions, refund seam, terminal
state rules, and idempotent handoff are implemented. Handoff now takes a
Tenant/Store-scoped row lock before replay/state checks. A verified Neon web
lifecycle races two identical handoff commands and both resolve to the one
completed fulfilment; the three-origin matrix covers the surrounding pickup
lifecycle.

- [x] Eligible paid pickup orders enter a store-scoped preparation queue with immutable order and item snapshots.
- [x] Required packing checks and authorized staff confirmation must pass before an order becomes ready for pickup.
- [x] Ready status creates a neutral notification and customer status action without disclosing prescription contents.
- [x] Pickup codes are random, scoped, expiring or lifecycle-bound, stored as digests, rate limited, and never exposed in logs.
- [x] Staff can verify the customer or an explicitly authorized collector before recording handoff.
- [x] Missing items, damaged items, incorrect collector, abandoned pickup, cancellation, and refund/escalation paths are explicit and audited.
- [x] Duplicate commands or concurrent staff actions cannot hand off an order twice or reverse a completed handoff.
- [x] Queue, permission, notification, code-security, exception, and end-to-end pickup tests are included.
