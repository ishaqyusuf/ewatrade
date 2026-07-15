# 07 - Post Supplier Purchase To Stock Ledger

**What to build:** An approved supplier-purchase inbound can be posted into the existing stock delivery and inventory movement flow, increasing inventory exactly once and linking posted stock back to the inbound cost snapshots.

**Blocked by:** 04 - Supplier Purchase Landed Costing; 06 - Inbound Review, Approval, And Audit

**Status:** ready-for-agent

- [ ] Posting an approved supplier-purchase inbound creates or links stock delivery records for the received lines.
- [ ] Posting creates inventory movements for each received product/unit line.
- [ ] Posting increases the selected product/unit inventory quantities by the received quantities.
- [ ] Posted movements include source references back to the inbound and line cost snapshots.
- [ ] Posting is idempotent by tenant/store and external id so retries cannot duplicate stock.
- [ ] Insufficient permissions or tenant/store mismatch blocks posting before inventory is mutated.
- [ ] Tests prove inventory does not change before posting and changes exactly once after posting.
