# 13 - Delivery Zones And Payable Delivery Quotes

**What to build:** Let a store configure supported delivery zones and pricing policies, securely determine customer eligibility, and produce a current Quote version containing the delivery fee and promise before the customer pays.

**Blocked by:** 01 - Store Activation And Professional Roles; 09 - Prescription Quote To Pickup Order

**Status:** implemented-source; delivery SOP acceptance pending

- [ ] Owner/admin users can enable delivery and configure service areas, fixed or manual fee policy, promise text, and unavailable-area behavior per store.
- [ ] Customers enter or confirm delivery details through a secure scoped route; sensitive address fields are not placed in URLs, analytics, or routine logs.
- [ ] Eligibility evaluation records the applicable zone/policy result and fails safely when no unambiguous store rule matches.
- [ ] Selecting delivery before payment creates a new immutable Quote version with the delivery fee, exact total, and fulfilment promise.
- [ ] Changing address, zone, fee, inventory, or fulfilment mode invalidates stale acceptance/payment actions and requires review of the current total.
- [ ] Manual delivery-fee decisions require an authorized staff member, structured reason, and audit event.
- [ ] Pickup remains available according to store policy when delivery is ineligible; the customer is never charged an undisclosed fee.
- [ ] Zone-boundary, fee, address-privacy, revision, concurrency, tenant-isolation, and customer-flow tests are included.
