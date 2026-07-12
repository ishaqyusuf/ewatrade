# 05 - Dry Cleaning Walk-In Service Order Flow

**What to build:** Staff can create a walk-in dry-cleaning service order by searching or creating a customer, selecting service items and quantities, reviewing totals, setting ready/delivery timing, choosing payment timing, and saving a received order.

**Blocked by:** 04 - Dry Cleaning Service Catalog

**Status:** ready-for-agent

- [ ] Staff can search existing customers by supported identity fields before creating a new customer.
- [ ] Staff can create a new customer inside the service order flow when no existing customer matches.
- [ ] Staff can select active service items and variants, enter quantities, and see line totals and order total update.
- [ ] Staff can set ready date/time or delivery timing where applicable.
- [ ] Staff can record payment timing/state such as paid now, unpaid, partially paid, pay on collection, or pay on delivery.
- [ ] Saving the order creates a received service order linked to tenant/store, customer, actor/staff member, service item snapshots, totals, and payment state.
- [ ] Creating a service order does not deduct Product Sales inventory or staff stock wallet balances.
- [ ] Automated tests cover customer reuse/create, line totals, payment state, timing, persistence, authorization, and no stock deduction.
