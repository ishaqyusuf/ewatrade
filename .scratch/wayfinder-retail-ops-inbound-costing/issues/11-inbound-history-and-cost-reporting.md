# 11 - Inbound History And Cost Reporting

**What to build:** Posted inbound records become visible in operational history and cost-aware reports, including stock movement context, supplier/source history, production-cost history, stock valuation inputs, and margin-ready cost snapshots.

**Blocked by:** 07 - Post Supplier Purchase To Stock Ledger; 08 - Post Production Batch To Stock Ledger; 09 - Markup Suggestions And Explicit Price Application

**Status:** ready-for-agent

- [ ] Users can view inbound history filtered by status, mode, date range, product/unit, and source label.
- [ ] Posted supplier-purchase and production-batch inbounds appear in stock movement history with clear source context.
- [ ] Cost snapshots are available to reporting code for stock valuation and margin calculations.
- [ ] Reports preserve sale-time selling price snapshots and do not recalculate historical revenue from current prices.
- [ ] Cost-sensitive report fields follow the same role restrictions as inbound detail views.
- [ ] CSV/export-ready report shapes include source, quantity, unit cost, total cost, and linked stock movement context where permitted.
- [ ] Tests prove posted inbound records appear in reports without leaking data across tenants or restricted roles.
