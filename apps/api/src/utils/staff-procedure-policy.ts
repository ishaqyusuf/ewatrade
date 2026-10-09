import type { StaffAction } from "@ewatrade/auth/store-access"

// Scoped staff use explicitly audited procedures. New procedures fail closed.
const reads = new Set([
  "tenant.current",
  "tenant.stores",
  "tenant.storeContext",
  "tenant.featureAvailability",
  "catalog.getItem",
  "catalog.listItems",
  "catalog.listItemsPage",
  "catalog.listUnitConfigurations",
  "catalog.listUnitDefinitions",
  "catalog.detail.overview",
  "catalog.detail.orders",
  "catalog.detail.activity",
  "catalog.categories.suggest",
  "catalog.categories.list",
  "orders.receiptSettings",
  "orders.prepareReceipts",
  "orders.customerCount",
  "orders.reportSummary",
  "orders.get",
  "orders.lookupOpen",
  "stores.orderVisibility",
  "search.global",
  "customers.getById",
  "orders.list",
  "orders.listPage",
  "orders.payments",
  "inventory.offeringAvailability",
])
const orders = new Set([
  "orders.create",
  "orders.fulfillProductLine",
  "orders.fulfillChargeOnlyServiceLine",
  "orders.fulfillProducts",
  "orders.recordPayment",
  "orders.returnProductLine",
  "inventory.reserveOffering",
  "inventory.releaseReservation",
  "inventory.commitReservation",
])
const stock = new Set([
  "inventory.categorySuggestions",
  "inventory.transfers",
  "inventory.auditExport",
  "inventory.balanceReport",
  "inventory.operationAudit",
  "inventory.operationHistory",
  "inventory.correctOperation",
  "inventory.createStockCount",
  "inventory.dispatchTransfer",
  "inventory.finalizeStockCount",
  "inventory.moveCustody",
  "inventory.postBalanceOperation",
  "inventory.transformPackagedStock",
  "inventory.transitionTransfer",
])
const reconciliation = new Set([
  "inventory.reconciliationReport",
  "inventory.createCloseout",
  "inventory.finalizeCloseout",
  "orders.authorizeChargeOnlyServiceLine",
])
const catalog = new Set([
  "catalog.photos.replace",
  "catalog.photos.remove",
  "catalog.photos.createIntent",
  "catalog.photos.getMetadata",
  "catalog.archiveOffering",
  "catalog.archiveVariant",
  "catalog.createUnitConfigurationDraft",
  "catalog.createUnitDefinition",
  "catalog.createSimpleItem",
  "catalog.createItem",
  "catalog.publishUnitConfiguration",
  "catalog.setOfferingAvailability",
  "catalog.updateUnitConfigurationDraft",
])
export function staffProcedureAction(
  path: string,
  type: string,
): StaffAction | "read" | null {
  if (path === "catalog.photos.getMetadata") return "catalog"
  if (type === "query" && reads.has(path)) return "read"
  if (orders.has(path)) return "orders"
  if (stock.has(path)) return "stock"
  if (reconciliation.has(path)) return "reconciliation"
  if (type === "mutation" && catalog.has(path)) return "catalog"
  return null
}
export const staffProcedureStoreInput = new Set([
  "orders.receiptSettings",
  "orders.prepareReceipts",
  "orders.reportSummary",
  "orders.create",
  "orders.list",
  "orders.listPage",
  "orders.payments",
  "inventory.offeringAvailability",
  "inventory.reserveOffering",
  "inventory.transfers",
  "inventory.auditExport",
  "inventory.balanceReport",
  "inventory.operationHistory",
  "inventory.reconciliationReport",
  "inventory.createCloseout",
  "inventory.createStockCount",
  "inventory.postBalanceOperation",
  "inventory.transformPackagedStock",
])
