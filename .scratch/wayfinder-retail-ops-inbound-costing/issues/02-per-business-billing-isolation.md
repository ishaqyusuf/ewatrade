# 02 - Per-Business Billing Isolation

**What to build:** Each business in the user's account resolves its own subscription state, usage, limits, and upgrade handoff, so one business's plan does not affect another business's products, staff, reports, or devices.

**Blocked by:** 01 - Business Account Switch And Create

**Status:** ready-for-agent

- [ ] Settings/Profile or billing surfaces show plan state for the selected active business.
- [ ] Switching businesses changes the visible subscription state, usage, and limits to the selected tenant.
- [ ] Product, staff, offline-device, business/store, and report-history limits resolve from the selected tenant's subscription.
- [ ] Staff-only users cannot manage billing for a business where they are not owner/admin.
- [ ] Owner/admin users can initiate the existing provider-neutral upgrade handoff for the selected business.
- [ ] Tests prove two businesses under one user can have different subscription states without leaking limits across tenants.
