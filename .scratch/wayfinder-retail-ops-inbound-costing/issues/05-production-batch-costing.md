# 05 - Production Batch Costing

**What to build:** A production-batch inbound draft can capture one output product/unit, expected quantity, produced quantity, rejected or waste quantity, free-form production cost lines, and calculated unit cost before any stock is posted.

**Blocked by:** 03 - Inbound Workspace Draft Lifecycle

**Status:** ready-for-agent

- [ ] Users can select one output product/unit for a production-batch inbound.
- [ ] Users can enter expected quantity, produced quantity, rejected or waste quantity, and notes.
- [ ] Users can add free-form raw material, transport, labor, manufacturing, packaging, overhead, and miscellaneous cost lines.
- [ ] The system calculates total production cost and produced unit cost from actual produced quantity.
- [ ] Waste or rejected output is visible as metadata but does not become sellable stock.
- [ ] Production-batch costing remains independent of full BOM/raw-material inventory consumption.
- [ ] Tests cover a rabbit-feed style production example and quantity variance.
