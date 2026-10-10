import type { StaffAction } from "@ewatrade/auth/store-access"

// Scoped staff use explicitly audited procedures. New procedures fail closed.
const reads = new Set([
  "assistant.availability",
  "assistant.conversations",
  "assistant.conversation",
  "assistant.allowance",
  "tenant.current",
  "tenant.stores",
  "tenant.storeContext",
  "tenant.featureAvailability",
  "catalog.getItem",
  "catalog.listItems",
  "catalog.count",
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
  "orders.operationalSummary",
  "orders.get",
  "orders.lookupOpen",
  "orders.lookupOpenPage",
  "stores.orderVisibility",
  "search.global",
  "customers.getById",
  "orders.list",
  "orders.listPage",
  "orders.payments",
  "inventory.offeringAvailability",
  "inventory.configuredOfferingAvailability",
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
  "inventory.balancePage",
  "inventory.compatibleTotalsPage",
  "inventory.lowStockPage",
  "inventory.operationAudit",
  "inventory.operationHistory",
  "inventory.correctOperation",
  "inventory.createStockCount",
  "inventory.stockCountReview",
  "inventory.transferReview",
  "inventory.dispatchTransfer",
  "inventory.finalizeStockCount",
  "inventory.moveCustody",
  "inventory.postBalanceOperation",
  "inventory.transformPackagedStock",
  "inventory.transitionTransfer",
])
const reconciliation = new Set([
  "orders.cancel", "orders.amendMetadata", "orders.replace",
  "orders.cancellationReview", "orders.metadataReview", "orders.replacementReview",
  "inventory.reconciliationReport",
  "inventory.closeouts",
  "inventory.closeoutReview",
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
  "catalog.updatePrice",
  "catalog.updateProductDetails",
  "catalog.updateProductIdentifiers",
])
export function staffProcedureAction(
  path: string,
  type: string,
): StaffAction | "read" | null {
  // These stage or decide scoped proposals; each action is checked separately.
  if (
    type === "mutation" &&
    [
      "assistant.start",
      "assistant.editProposal",
      "assistant.decideProposal",
    ].includes(path)
  )
    return "read"
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
  "orders.operationalSummary",
  "orders.create",
  "orders.list",
  "orders.listPage",
  "orders.payments",
  "inventory.offeringAvailability",
  "inventory.configuredOfferingAvailability",
  "inventory.reserveOffering",
  "inventory.transfers",
  "inventory.auditExport",
  "inventory.balanceReport",
  "inventory.balancePage",
  "inventory.compatibleTotalsPage",
  "inventory.lowStockPage",
  "inventory.operationHistory",
  "inventory.reconciliationReport",
  "inventory.closeouts",
  "inventory.closeoutReview",
  "inventory.createCloseout",
  "inventory.createStockCount",
  "inventory.stockCountReview",
  "inventory.transferReview",
  "inventory.postBalanceOperation",
  "inventory.transformPackagedStock",
])
