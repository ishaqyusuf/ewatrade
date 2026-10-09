import type { CoverageOwner, ProcedureRule } from "./types"

/**
 * Classification of every merchant tRPC procedure that is not a capability.
 * Keys are `router.procedure` paths; a trailing or inner `*` matches any
 * characters. Exact paths win, then the longest matching pattern. Tickets refer
 * to `.brain/plans/2026-10-09-assistant-business-operations.md`.
 */
export const procedureRules: Record<string, ProcedureRule> = {}

function planned(owner: CoverageOwner, ticket: string, paths: string[]) {
  for (const path of paths)
    procedureRules[path] = { owner, status: "planned", ticket }
}
function formOnly(owner: CoverageOwner, reason: string, paths: string[]) {
  for (const path of paths)
    procedureRules[path] = { owner, status: "form_only", reason }
}
function excluded(owner: CoverageOwner, reason: string, paths: string[]) {
  for (const path of paths)
    procedureRules[path] = { owner, status: "excluded", reason }
}

excluded("assistant", "Assistant transport or a dedicated assistant flow.", [
  "assistant.*",
  "setupAssistant.*",
  "productAssistant.*",
])
excluded("platform", "Internal QA tooling.", ["qa*"])
excluded(
  "platform",
  "Device sync; assistant writes stay online-only until replay supports them.",
  ["offline.*"],
)
excluded(
  "platform",
  "Client session context; the server supplies assistant scope.",
  [
    "tenant.current",
    "tenant.storeContext",
    "tenant.featureAvailability",
    "tenant.analyticsContext",
    "tenant.stores",
  ],
)
formOnly(
  "platform",
  "Creating a Store changes plan usage and setup; use Store management.",
  ["tenant.createStore", "tenant.createInventoryStore"],
)
formOnly(
  "platform",
  "Subscription purchase and verification use the billing checkout.",
  [
    "retailOps.subscription",
    "retailOps.createSubscriptionCheckoutIntent",
    "storeSubscriptions.*",
  ],
)
formOnly(
  "platform",
  "Domain purchase and DNS use registrar checkout and verification.",
  ["domains.*"],
)

// Catalog
planned("catalog", "B04", [
  "catalog.listItems",
  "catalog.listItemsPage",
  "catalog.detail.*",
])
planned("catalog", "B02", ["catalog.categories.*"])
planned("catalog", "B03", [
  "catalog.createItem",
  "catalog.setProductUsage",
  "catalog.setOfferingAvailability",
  "catalog.*UnitConfiguration*",
  "catalog.*UnitDefinition*",
])
planned("catalog", "G04", ["catalog.archiveOffering", "catalog.archiveVariant"])
formOnly("catalog", "Photo capture and upload belong to the product form.", [
  "catalog.photos.*",
])

// Customers
planned("customers", "B01", ["customers.getById", "customers.listPage"])
planned("customers", "B04", [
  "customers.count",
  "orders.customerCount",
  "customerLedger.receivables",
])
planned("customers", "E02", ["customerLedger.*"])
formOnly(
  "customers",
  "Opening debt is captured by Setup and the ledger form; it is not new money.",
  ["customerLedger.recordOpening"],
)

// Sales
planned("sales", "B04", ["orders.lookupOpen"])
planned("sales", "B05", ["orders.payments", "orders.prepareReceipts"])
planned("sales", "D02", [
  "orders.fulfillProducts",
  "orders.fulfillProductLine",
  "orders.fulfillChargeOnlyServiceLine",
  "orders.authorizeChargeOnlyServiceLine",
])
planned("sales", "D03", ["orders.returnProductLine"])
planned("sales", "G05", [
  "orders.*Settings",
  "stores.orderVisibility",
  "stores.updateOrderVisibility",
])
excluded("sales", "Unbounded legacy list; the assistant reads bounded pages.", [
  "orders.list",
  "services.queue",
])

// Inventory
planned("inventory", "B04", [
  "inventory.offeringAvailability",
  "inventory.balanceReport",
])
planned("inventory", "C01", [
  "inventory.postBalanceOperation",
  "inventory.categorySuggestions",
])
planned("inventory", "C02", [
  "inventory.createStockCount",
  "inventory.finalizeStockCount",
])
planned("inventory", "C03", [
  "inventory.correctOperation",
  "inventory.operationHistory",
])
planned("inventory", "C04", ["inventory.*Transfer*", "inventory.transfers"])
planned("inventory", "C05", [
  "inventory.*Closeout",
  "inventory.reconciliationReport",
])
planned("inventory", "G04", [
  "inventory.moveCustody",
  "inventory.transformPackagedStock",
  "inventory.*Reservation",
  "inventory.reserveOffering",
])
planned("staff", "S05", ["inventory.operationAudit"])
formOnly("inventory", "Bulk file export; download it from the page.", [
  "inventory.auditExport",
  "serviceReporting.auditExport",
])

// Services
planned("services", "D04", ["services.*Intake*"])
planned("services", "D05", ["services.*"])
planned("services", "G05", ["services.*Settings"])
planned("services", "H04", ["services.*Evidence*"])
formOnly("services", "Bulk queue updates stay in the queue view.", [
  "services.batchUpdate",
])

// Finance
planned("finance", "E01", [
  "finance.book",
  "finance.createMoneyAccount",
  "finance.balances",
  "finance.account*",
  "finance.commandStatus",
])
formOnly("finance", "Opening the Book is a guided setup with fiscal choices.", [
  "finance.setup",
])
planned("finance", "E03", ["finance.*Money*", "finance.moneyMovement"])
planned("finance", "E04", [
  "finance.*Expense*",
  "finance.*Bill*",
  "finance.bill",
  "finance.bills",
])
planned("finance", "H04", ["finance.expenseReceipts.*"])
planned("finance", "E05", [
  "finance.*Supplier*",
  "finance.supplierStatement",
  "finance.suppliers",
  "finance.*Purchase*",
  "finance.purchase*",
])
planned("finance", "G01", [
  "finance.reports",
  "finance.journal",
  "finance.supplierPayableAging",
  "serviceReporting.summary",
  "serviceCommerce.report*",
])
planned("finance", "G02", [
  "finance.*CashCount",
  "finance.cashCount*",
  "finance.reverseCashAdjustment",
  "finance.periods",
  "finance.periodCloseChecklist",
  "finance.periodAudit",
])
formOnly(
  "finance",
  "Period close, reopen and fiscal calendar changes are privileged Finance actions.",
  [
    "finance.changePeriod",
    "finance.configureFiscalCalendar",
    "finance.fiscalCalendar",
    "finance.yearEndPreview",
  ],
)
formOnly(
  "finance",
  "Bank statement import and matching are file-driven reconciliation.",
  ["finance.bankStatements.*"],
)

// Staff
planned("staff", "S01", ["retailOps.staff"])
planned("staff", "S02", ["retailOps.inviteStaff"])
planned("staff", "S03", ["retailOps.updateStaffStatus"])

// Service commerce, communications and regulated workflows
planned("commerce", "G03", [
  "serviceAccess.*",
  "serviceCommerce.*Booking",
  "serviceCommerce.holdBookingSlot",
  "serviceCommerce.*CatalogOffering",
  "serviceCommerce.attestCatalogAvailability",
  "serviceCommerce.catalogGraduationReadiness",
  "serviceCommerce.catalogMatches",
  "serviceCommerce.createCatalogDraft",
  "serviceCommerce.*QuoteVersion",
  "serviceCommerce.pendingQuoteApprovals",
  "serviceCommerce.quoteApprovalDetail",
  "serviceCommerce.*Fulfillment",
  "serviceCommerce.fulfillmentDetail",
  "serviceCommerce.*Inquiry*",
  "serviceCommerce.sourceProjection",
  "serviceCommerce.submitStaffIntake",
])
planned("catalog", "B02", [
  "serviceCommerce.catalogPricePromotionImpact",
  "serviceCommerce.catalogPriceSuggestions",
  "serviceCommerce.promoteCatalogPrice",
])
planned("commerce", "G05", [
  "serviceCommerce.setActivation",
  "serviceCommerce.updateProfile",
  "serviceCommerce.workspaceAccess",
  "serviceCommerce.issueCustomerActions",
  "serviceCommerce.*BookingCapability",
  "serviceCommerce.*BookingResource",
  "serviceCommerce.*ookingConfiguration",
  "serviceCommerce.*uoteReleaseSettings",
  "serviceCommerce.*toreConversationAvailability*",
  "serviceCommerce.*toreConversationChannelMode*",
  "serviceCommerce.setStoreConversationManualPause",
  "serviceCommerce.storeConversationQueue",
  "serviceCommerce.storeConversationTimeline",
  "serviceCommerce.storeConversationMessagesAfter",
  "serviceCommunications.*",
])
formOnly(
  "commerce",
  "Customer conversations are answered by staff in the inbox, not by the assistant.",
  [
    "serviceCommerce.*StoreConversation",
    "serviceCommerce.*StoreConversationStaffRead",
    "serviceCommerce.*StoreConversationAttachmentViewerGrant",
    "serviceCommerce.eligibleStoreConversationAttendants",
  ],
)
formOnly(
  "commerce",
  "Messaging channel connection uses provider sign-up and credentials.",
  [
    "serviceCommerce.*ChannelAttendant",
    "serviceCommerce.*hannelEmbeddedSignup*",
    "serviceCommerce.channelWorkspace",
    "serviceCommerce.*CustomerEntryPoint",
    "serviceCommerce.*CustomerChannel*",
    "serviceCommerce.saveCustomerWhatsAppConnection",
  ],
)
formOnly("privacy", "Private media review requires viewer grants.", [
  "serviceCommerce.mediaAttachment",
  "serviceCommerce.requestMediaViewerGrant",
  "serviceCommerce.verifyMediaObservation",
])
formOnly("privacy", "Policy decisions are compliance controls.", [
  "serviceCommerce.*PolicyDecision",
  "serviceCommerce.policyDecision*",
])
formOnly(
  "commerce",
  "Regulated pharmacy workflow with its own role gates and compliance audit.",
  ["prescriptions.*"],
)
