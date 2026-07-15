# 09 - Markup Suggestions And Explicit Price Application

**What to build:** Inbound cost snapshots can generate suggested selling prices from markup, but catalog selling prices only change after explicit owner/admin/manager approval and are recorded in price history.

**Blocked by:** 04 - Supplier Purchase Landed Costing; 05 - Production Batch Costing; 06 - Inbound Review, Approval, And Audit

**Status:** ready-for-agent

- [ ] Users can enter markup or profit percentage for inbound lines.
- [ ] The system calculates suggested selling prices from landed or production unit cost.
- [ ] Suggested prices are visible before approval but do not automatically update product/unit selling prices.
- [ ] Owner/admin/manager users can explicitly apply a suggested selling price to a product/unit.
- [ ] Applying a suggested price creates a price-history entry tied to inbound costing.
- [ ] Historical sale revenue remains based on sale-time price snapshots.
- [ ] Tests prove suggestions do not mutate prices until explicit approval.
