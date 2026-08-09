# 13 - Delivery Zones And Payable Delivery Quotes

**What to build:** Let a store configure supported delivery zones and pricing policies, securely determine customer eligibility, and produce a current Quote version containing the delivery fee and promise before the customer pays.

**Blocked by:** 01 - Store Activation And Professional Roles; 09 - Prescription Quote To Pickup Order

**Status:** implemented-source; delivery SOP acceptance pending

**Verification note (2026-08-09):** delivery configuration and evaluation are
Store-scoped, and active-zone lookup also carries the Quote Tenant explicitly.
Sensitive addresses are encrypted with a non-reversible locality fingerprint.
Focused rules cover normalized locality, postal-prefix priority, fixed fee,
manual review, ambiguity, and ineligibility. Eligible and approved-manual routes
create a new versioned delivery Quote and supersede the prior capability in one
transaction. A disposable Neon fixture now exercises web, staff-assisted, and
WhatsApp origins through fixed-zone address selection, immutable delivery Quote
revision, stale-token rejection, concurrent acceptance, exact fee/payment,
address-safe projections, inventory reservation, and Tenant/Store-scoped queue
reads. Live delivery SOP acceptance remains a separate production gate.

- [x] Owner/admin users can enable delivery and configure service areas, fixed or manual fee policy, promise text, and unavailable-area behavior per store.
- [x] Customers enter or confirm delivery details through a secure scoped route; sensitive address fields are not placed in URLs, analytics, or routine logs.
- [x] Eligibility evaluation records the applicable zone/policy result and fails safely when no unambiguous store rule matches.
- [x] Selecting delivery before payment creates a new immutable Quote version with the delivery fee, exact total, and fulfilment promise.
- [x] Changing address, zone, fee, inventory, or fulfilment mode invalidates stale acceptance/payment actions and requires review of the current total.
- [x] Manual delivery-fee decisions require an authorized staff member, structured reason, and audit event.
- [x] Pickup remains available according to store policy when delivery is ineligible; the customer is never charged an undisclosed fee.
- [x] Zone-boundary, fee, address-privacy, revision, concurrency, tenant-isolation, and customer-flow tests are included.
