# 08 - Dry Cleaning Public Service-Request Link

**What to build:** A dry-cleaning business can share a public request link; customers submit pickup/service requests; staff can confirm, reject, or convert requests into service orders.

**Blocked by:** 05 - Dry Cleaning Walk-In Service Order Flow

**Status:** ready-for-agent

- [ ] Authorized business users can create or access an active public service-request link for a Dry Cleaning/Laundry store.
- [ ] The public link uses opaque identifiers and does not expose raw database IDs.
- [ ] Customers can submit contact details, pickup address or drop-off preference, preferred pickup time, notes, and optional item/package description.
- [ ] Submitted requests enter a pending state and are visible to authorized staff for review.
- [ ] Staff can confirm or reject a pending request.
- [ ] Staff can convert a confirmed request into a service order that uses the same customer and service-order flow as walk-in orders.
- [ ] Automated tests cover link creation/resolution, request submission, pending review, confirmation, rejection, conversion, and public/tenant authorization boundaries.
