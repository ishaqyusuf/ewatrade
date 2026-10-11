# Purchase agreement editor — 11 October 2026

Evidence: manual-web component QA; no provider/model or database operation.
Compared goods cards, compact rows and step groups; selected goods cards to keep
quantity and total cost together. Workshop and screenshot retained locally.

GeneralPurchaseRegistrationEditor registered for purchase_register. Supplier/Book/
goods/unit/config/category targets remain fixed. Editable description, UTC agreement
date, line description, exact quantity and line total cost. Fresh agreement-only
acknowledgment required; Save returns a validated fresh-review payload.

Browser verified:
- Missing acknowledgment refuses save.
- Zero quantity and zero line cost refuse save.
- 2.125 quantity and0.01 cost save as exact strings2.125 and1 minor unit.
- Unchanged date preserves2026-10-01T12:00:00.123Z and original target/category IDs.
- Cancel returns without saving.

Screenshot artifacts/assistant-operations-web/e05-purchase-editor.jpg; comparison
and component harness retained beside it. Temporary app route and tab removed.
No broad/redundant test run. Full proposal database and web confirmation/receipt
acceptance pending. E05 incomplete; no mobile/schema/activation/deployment.
