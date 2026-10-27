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
  "assistantChannels.*",
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
  ],
)
formOnly(
  "platform",
  "Creating a Store changes plan usage and setup; use Store management.",
  ["tenant.createStore", "tenant.createInventoryStore"],
)
formOnly(
  "platform",
  "Owner/Admin Store contact settings require explicit form review and current saved contact fields; no assistant configuration mutation or message send.",
  ["stores.contact", "stores.updateContact"],
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
formOnly(
  "platform",
  "Storefront preview/edit/cancel/publish/rollback use the studio. Only the registered dashboard design read/generate/accept capabilities use shared commands and explicit confirmation.",
  ["storefront.*"],
)

// Catalog
planned("platform", "G05", [
  "customerMessages.preview",
  "customerMessages.catalog",
  "customerMessages.templateStatus",
])
formOnly(
  "platform",
  "Manual WhatsApp composition/settings and reviewed AI drafts; no assistant provider-send or template-write authority.",
  [
    "customerMessages.prepareOpen",
    "customerMessages.draftWithAi",
    "customerMessages.templates.*",
  ],
)
// Unified Activity/alerts source exists locally; no GENERAL tool is activated.
planned("platform", "S05", [
  "activity.listPage",
  "activity.get",
  "activity.filters",
  "businessNotifications.listMine",
  "businessNotifications.unreadCount",
])
formOnly(
  "platform",
  "Own alert preferences and receipt state stay in the personal inbox until a dedicated confirmed assistant flow is built.",
  [
    "businessNotifications.myPreferences",
    "businessNotifications.updateMyPreferences",
    "businessNotifications.markRead",
    "businessNotifications.archive",
    "businessNotifications.markAllRead",
  ],
)
formOnly(
  "platform",
  "Owner/Admin notification policy and recipient assignments require explicit settings review; no assistant configuration mutation is activated.",
  [
    "businessNotifications.policy",
    "businessNotifications.updatePolicy",
    "businessNotifications.subscriptions",
    "businessNotifications.updateSubscription",
  ],
)

formOnly(
  "catalog",
  "Generic item editor payload; assistant uses active-Store detail.overview with stock permission filtering.",
  ["catalog.getItem"],
)
excluded(
  "catalog",
  "Unbounded legacy list; assistant uses stable listItemsPage continuation.",
  ["catalog.listItems"],
)
planned("catalog", "B02", ["catalog.categories.*"])
planned("catalog", "B03", [
  "catalog.createItem",
  "catalog.setProductUsage",
  "catalog.*UnitConfiguration*",
  "catalog.*UnitDefinition*",
])
// catalog.archiveOffering/archiveVariant are supported by catalog.archive.
formOnly("catalog", "Photo capture and upload belong to the product form.", [
  "catalog.photos.*",
])
formOnly(
  "catalog",
  "Explicit native Catalog sheet/menu commands; assistant model tools cannot invoke these writes. Assistant edits use the narrow price, details, identifier and availability capabilities.",
  ["catalog.updateItem", "catalog.addServiceChoice"],
)

// Customers
planned("customers", "E02", ["customerLedger.*"])
formOnly(
  "customers",
  "Opening debt is captured by Setup and the ledger form; it is not new money.",
  ["customerLedger.recordOpening"],
)

// Sales
formOnly(
  "sales",
  "Legacy payment/fulfilment lookup exception; assistant uses lookupOpenPage with normal list visibility and continuation.",
  ["orders.lookupOpen"],
)
planned("sales", "B05", ["orders.payments", "orders.prepareReceipts"])
// Receipt/reminder settings and sales-rep visibility are supported by
// settings.store.read and settings.store.change.
excluded("sales", "Unbounded legacy list; the assistant reads bounded pages.", [
  "orders.list",
  "services.queue",
])

// Inventory
formOnly(
  "inventory",
  "Exact protected stock-editor context and Store-eligible custody choices; no standalone model read tool or confirmation authority. Native stock editors and originals remain in A04 scope.",
  ["inventory.balanceSource", "inventory.custodyAssignees"],
)
formOnly(
  "inventory",
  "Legacy full response; assistant uses balancePage and compatibleTotalsPage, preserving complete source-group totals with response pagination.",
  ["inventory.balanceReport"],
)
formOnly(
  "inventory",
  "Legacy availability may initialize a zero source; assistant uses configuredOfferingAvailability, which never creates missing stock.",
  ["inventory.offeringAvailability"],
)

formOnly(
  "inventory",
  "Count stock sheet: lists this Store's saved count drafts to finish or discard. The assistant reads a saved count with readStockCount and creates new counts itself.",
  ["inventory.stockCounts"],
)
formOnly(
  "inventory",
  "Discarding a saved count draft is a dashboard step with its own confirmation; nothing changes stock. The assistant starts a new count instead.",
  ["inventory.discardStockCount"],
)
planned("inventory", "C03", ["inventory.recordInternalUse"])
formOnly(
  "inventory",
  "Display setting for Running low on the Inventory page; it never changes stock or blocks a sale. The assistant reads low stock with lowStockPage and its own threshold.",
  ["inventory.setLowStockLevel"],
)
planned("inventory", "C05", ["inventory.reconciliationReport"])
planned("inventory", "G04", [
  "inventory.*Reservation",
  "inventory.reserveOffering",
])
// Source-owned undo of a packing transform (F4.3.03); no assistant draft yet.
planned("inventory", "G04", ["inventory.reverseTransformation"])
formOnly("inventory", "Bulk file export; download it from the page.", [
  "inventory.auditExport",
  "serviceReporting.auditExport",
])

// Services
formOnly(
  "services",
  "Native Assistant card completion receipt; no model creation or channel grant.",
  ["services.assistantJobCard"],
)
planned("services", "D04", ["services.*Intake*"])
planned("services", "D05", ["services.*"])
planned("services", "G05", ["services.*Settings"])
planned("services", "H04", ["services.*Evidence*"])
// Saved Order notes and attachment metadata are not yet exposed by a read tool.
planned("sales", "H04", ["orders.activity.list"])
formOnly("sales", "Video capture and upload belong to the order screen.", [
  "orders.activity.uploadTarget",
  "orders.activity.confirmUpload",
])
formOnly("services", "Bulk queue updates stay in the queue view.", [
  "services.batchUpdate",
])

// Finance
planned("finance", "E01", [
  "finance.book",
  "finance.account*",
  "finance.commandStatus",
])
formOnly("finance", "Opening the Book is a guided setup with fiscal choices.", [
  "finance.setup",
])
planned("finance", "E03", ["finance.*Money*", "finance.moneyMovement"])
planned("finance", "E04", ["finance.*Expense*", "finance.*Bill*"])
planned("finance", "H04", ["finance.expenseReceipts.*"])
planned("finance", "E05", [
  "finance.*Supplier*",
  "finance.*Purchase*",
  "finance.purchase*",
  "finance.supplierOpeningBalance",
])
excluded(
  "finance",
  "Dashboard list projections for Finance pages; the assistant answers these amounts through supplier statements, customer statements and money account balances.",
  [
    "finance.owedSummary",
    "finance.customerBalances",
    "finance.customerBalanceDirectory",
    "finance.supplierDirectory",
  ],
)
planned("finance", "G01", [
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
    "finance.inventoryReconciliation",
    "finance.openingEquityReconciliation",
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

// Service commerce, communications and regulated workflows
formOnly(
  "commerce",
  "Dashboard manager-reviewed staff quote cart. No assistant write or channel activation is added; existing canonical quote authority and customer acceptance remain required.",
  ["serviceAccess.createStaffQuote"],
)
planned("commerce", "G03", ["serviceAssistantBookings.availability"])
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

// Newly exposed native Order reads/corrections still await assistant acceptance.
planned("sales", "D01", ["orders.changeOptions"])
planned("sales", "D02", ["orders.timeline"])
planned("sales", "D03", [
  "orders.paymentAccounts",
  "orders.refund",
  "orders.returnItems",
  // Store returns/refunds approval flow (13 Oct 2026); the assistant must
  // respect the Store setting before it can draft either change.
  "orders.changePolicy",
  "orders.pendingChangeApprovals",
  "orders.requestChangeApproval",
  "orders.withdrawChangeApproval",
  "orders.recordApprovedChange",
])
planned("sales", "G05", ["orders.updateChangePolicy"])
excluded(
  "sales",
  "Approving a staff return or refund is the Owner/Admin's own decision.",
  ["orders.decideChangeApproval"],
)

planned("services", "D04", ["serviceAssistantIntake.receipt"])

planned("sales", "G01", ["businessReporting.read", "orders.salesReport"])

formOnly(
  "platform",
  "Owner signup and storefront preview are explicit forms; no assistant setup, plan selection or public publishing authority.",
  ["tenant.ownerSignupSummary", "tenant.storefrontPreview"],
)

formOnly(
  "services",
  "Native work completion independently of payment; no model-executable command or WhatsApp/mobile rollout added.",
  ["services.completeJob"],
)
