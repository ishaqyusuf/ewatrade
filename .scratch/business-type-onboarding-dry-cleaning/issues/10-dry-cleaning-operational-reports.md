# 10 - Dry Cleaning Operational Reports

**What to build:** Owners can see dry-cleaning service-order metrics such as received, ready, delayed, completed, unpaid/paid totals, service item totals, and staff activity without disturbing Product Sales reports.

**Blocked by:** 06 - Dry Cleaning Evidence, Notes, And Status Lifecycle

**Status:** ready-for-agent

- [ ] Dry Cleaning/Laundry reporting summarizes service orders by status, date range, service item, payment state, and staff member where available.
- [ ] Reports expose received, ready, delayed, completed, unpaid amount, paid amount, service item totals, and staff activity metrics.
- [ ] Product Sales report labels and inventory/sales calculations remain unchanged.
- [ ] Reports respect tenant/store authorization and staff role visibility.
- [ ] Report data can be verified from created service orders without relying on implementation-only internals.
- [ ] Automated tests cover report totals, filters, staff scoping, payment-state summaries, Product Sales compatibility, and authorization.
