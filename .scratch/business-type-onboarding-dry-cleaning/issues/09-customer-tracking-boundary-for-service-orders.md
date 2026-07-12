# 09 - Customer Tracking Boundary For Service Orders

**What to build:** Customers get a safe accountless or identity-aware way to view dry-cleaning service order/request status without exposing raw database IDs, preserving the future unified customer dashboard path.

**Blocked by:** 06 - Dry Cleaning Evidence, Notes, And Status Lifecycle; 08 - Dry Cleaning Public Service-Request Link

**Status:** ready-for-agent

- [ ] Service orders or service requests expose a safe customer-facing tracking reference or opaque token.
- [ ] Customers can view a bounded status page showing only appropriate information such as received, in progress, ready, delayed, completed, or cancelled state.
- [ ] Customer-facing tracking does not expose private media evidence unless explicitly allowed by a future policy.
- [ ] Tracking works for public service requests and staff-created service orders where customer contact information is available.
- [ ] The model preserves a path toward a future unified customer dashboard across Product Sales and service orders.
- [ ] Automated tests cover opaque tracking resolution, privacy boundaries, status display, invalid/expired tokens, and tenant isolation.
