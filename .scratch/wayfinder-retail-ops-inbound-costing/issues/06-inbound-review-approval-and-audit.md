# 06 - Inbound Review, Approval, And Audit

**What to build:** Costed supplier-purchase and production-batch inbounds can be reviewed, approved, or cancelled with an audit trail, while preserving the rule that inventory and selling prices do not change until explicit posting or price approval happens later.

**Blocked by:** 04 - Supplier Purchase Landed Costing; 05 - Production Batch Costing

**Status:** ready-for-agent

- [ ] Users can move a complete inbound draft into a review/costed state.
- [ ] Owner/admin/manager roles can approve a reviewed inbound.
- [ ] Approved inbound records preserve final cost snapshots and approval metadata.
- [ ] Draft records remain editable, while approved records require explicit correction workflows instead of silent mutation.
- [ ] Cancelled inbounds remain visible for audit but cannot be posted.
- [ ] Audit history records meaningful changes to quantities, cost lines, allocation, review, approval, and cancellation.
- [ ] Tests prove review and approval do not mutate inventory or selling prices.
