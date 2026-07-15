# 08 - Post Production Batch To Stock Ledger

**What to build:** An approved production-batch inbound can be posted into the existing stock ledger as produced output, increasing finished-goods inventory exactly once with production cost metadata.

**Blocked by:** 05 - Production Batch Costing; 06 - Inbound Review, Approval, And Audit

**Status:** ready-for-agent

- [ ] Posting an approved production batch creates or links stock delivery and movement records for the produced output.
- [ ] Posting increases only the produced output product/unit quantity, not rejected or waste quantity.
- [ ] Posted movements include production source metadata and unit cost snapshots.
- [ ] Posting is idempotent by tenant/store and external id so retries cannot duplicate produced stock.
- [ ] Production posting remains separate from raw-material inventory consumption in v1.
- [ ] Insufficient permissions or tenant/store mismatch blocks posting before inventory is mutated.
- [ ] Tests prove produced output posts exactly once and waste does not become sellable stock.
