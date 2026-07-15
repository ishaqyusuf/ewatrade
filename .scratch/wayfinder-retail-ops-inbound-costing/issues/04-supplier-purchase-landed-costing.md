# 04 - Supplier Purchase Landed Costing

**What to build:** A supplier-purchase inbound draft can capture product/unit lines, expected and received quantities, supplier costs, additional landed-cost lines, allocation method, rounding, and calculated landed unit cost before any stock is posted.

**Blocked by:** 03 - Inbound Workspace Draft Lifecycle

**Status:** ready-for-agent

- [ ] Users can add existing product/unit lines to a supplier-purchase inbound.
- [ ] Users can enter expected quantity, received quantity, supplier unit cost, and supplier total for each line.
- [ ] Users can add extra cost lines such as shipping, waybill, clearing, transport, packaging, and miscellaneous fees.
- [ ] V1 supports quantity-based, line-value-based, and manual cost allocation.
- [ ] Allocation totals reconcile to the entered additional costs in minor currency units.
- [ ] The UI/API returns supplier subtotal, additional cost total, landed total, allocated cost per line, and landed unit cost.
- [ ] Tests cover allocation, rounding, and at least one multi-product landed-cost example.
