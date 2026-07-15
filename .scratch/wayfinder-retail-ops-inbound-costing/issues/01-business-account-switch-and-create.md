# 01 - Business Account Switch And Create

**What to build:** A signed-in user can open Settings/Profile, see every business they belong to, identify their role in each business, switch the active business, and create a new owned business from the same account without changing their permissions in another business where they are only staff.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] A user with staff membership in one business and owner/admin membership in another can see both businesses in the account switcher.
- [ ] The current active business is visibly marked before the user enters business-scoped workflows.
- [ ] Switching businesses updates the active tenant/store context used by dashboard and mobile Retail Ops reads.
- [ ] Creating a new business from a staff-only account creates a new owned business with owner/admin access for that new business only.
- [ ] Staff-only membership in an existing business does not allow tenant-management or billing access for that business.
- [ ] Tenant isolation tests prove the user cannot read or mutate data for businesses where they lack membership.
