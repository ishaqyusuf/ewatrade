# 10 - Cost-Safe Staff Permissions

**What to build:** Inbound views and actions enforce cost-sensitive permissions so owners/admins/managers can manage costs and margins, while staff users only see or act on approved operational stock information where permitted.

**Blocked by:** 06 - Inbound Review, Approval, And Audit; 07 - Post Supplier Purchase To Stock Ledger; 08 - Post Production Batch To Stock Ledger

**Status:** ready-for-agent

- [ ] Owner/admin/manager roles can view supplier costs, allocated costs, landed cost, production cost, markup, and margin fields.
- [ ] Staff-only users cannot view cost, markup, margin, or supplier-cost details by default.
- [ ] Staff-only users cannot approve inbounds or apply selling-price changes.
- [ ] Permitted POS-capable users can perform allowed operational receive/post actions without exposing hidden cost fields.
- [ ] API responses omit restricted cost fields for roles that cannot view them.
- [ ] UI states make restricted access clear without leaking hidden values.
- [ ] Authorization tests cover owner/admin/manager and staff-only behavior across tenants.
