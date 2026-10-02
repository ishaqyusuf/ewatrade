# Poultry MVP using existing products and inventory

Updated: 1 October 2026

The canonical plan is [Minimum inventory categories implementation plan](../../.brain/plans/2026-10-01-minimum-inventory-categories.md).

The revised database design adds StockOperationCategoryName for reusable Tenant-owned labels and StockOperationCategory for operation/name links. StockOperation.categories is a relation array of assignment records; it is not a stored string array. Birds and eggs remain ordinary Products using existing receipts, adjustments and sales fulfilment.

The canonical checklist covers relational schema, atomic name reuse/link creation, compatible commands, suggestions, generic mobile/dashboard pills, correction inheritance, joined history/export display and rollout. Category-name-ID filters follow as the next small slice. Earlier separate Farm, reason/origin/details and string-array proposals are superseded.

Planning is complete; application implementation, migration and deployment have not started.
