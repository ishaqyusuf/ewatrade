"use client"

import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { assistantObjectParams } from "./assistant-object-params"
import { serviceWorkParams } from "./service-work-params"
import { activitySheetParams } from "./use-activity-params"
import { alertPreferencesParams } from "./use-alert-preferences-params"
import { catalogItemParamParsers } from "./use-catalog-item-params"
import { customerLedgerModes } from "./use-customer-ledger-params"
import { customerMessageParams } from "./use-customer-message-params"
import { domainParams } from "./use-domain-params"
import { financeSheetModes } from "./use-finance-params"
import { INVENTORY_OPERATION_MODES } from "./use-inventory-params"
import { orderSheetParams } from "./use-order-params"
import { prescriptionParamsSchema } from "./use-prescription-params"
import { receiptParams } from "./use-receipt-params"
import { serviceCommerceParams } from "./use-service-commerce-params"
import { storeConversationParams } from "./use-store-conversation-params"

/** Delivery hints only. Each loaded sheet retains its current read/command checks. */
const params = {
  ...assistantObjectParams,
  ...orderSheetParams,
  ...activitySheetParams,
  ...receiptParams,
  ...prescriptionParamsSchema,
  catalogItem: catalogItemParamParsers.catalogItem,
  catalogEditItem: catalogItemParamParsers.catalogEditItem,
  domainMode: domainParams.domainMode,
  financeSheet: parseAsStringLiteral(financeSheetModes),
  serviceSheet: serviceWorkParams.serviceSheet,
  requestId: serviceWorkParams.requestId,
  messageSheet: customerMessageParams.messageSheet,
  messageOrderId: customerMessageParams.messageOrderId,
  messageEvent: customerMessageParams.messageEvent,
  messageOffer: customerMessageParams.messageOffer,
  serviceCommerceSheet: serviceCommerceParams.serviceCommerceSheet,
  conversationId: storeConversationParams.conversationId,
  conversationSheet: storeConversationParams.conversationSheet,
  ledgerAccount: parseAsString,
  ledgerAction: parseAsStringLiteral(customerLedgerModes),
  ...alertPreferencesParams,
}

export function useGlobalSheetIntents() {
  const [p] = useQueryStates(params)
  return {
    CatalogItemSheet:
      p.catalogItem === "create" ||
      (p.catalogItem === "edit" && Boolean(p.catalogEditItem)),
    CatalogItemDetailModal: Boolean(p.catalogDetail),
    CustomerRequestSheet:
      (p.serviceSheet === "customer_request" || p.serviceSheet === "quote") &&
      Boolean(p.requestId),
    ServiceIntakeSheet: p.serviceSheet === "intake",
    ServiceJobSheet: p.serviceSheet === "job" && Boolean(p.jobId),
    ServiceIntakeReceiptSheet: p.serviceIntake !== null,
    ServiceWorkOriginalSheet: p.assistantWorkOriginal !== null,
    BusinessNotificationPreferencesSheet: p.alertPreferences === true,
    ActivitySheet: Boolean(p.activityEvent?.trim()),
    AssistantBookingSheet: p.assistantBooking !== null,
    AssistantCashCountSheet: Boolean(p.assistantCashCount),
    AssistantDayCloseSheet: Boolean(p.assistantDayCloseBook),
    AssistantManualMessageSheet: p.assistantManualMessage !== null,
    AssistantQuoteApprovalSheet: p.assistantQuoteApproval !== null,
    AssistantServiceRequestSheet: p.assistantServiceRequest !== null,
    BusinessReportSheet: p.businessReport !== null,
    CloseoutSheet: Boolean(p.inventoryCloseout),
    CustomerDetailsSheet: Boolean(p.customerDetail),
    CustomerLedgerSheet: Boolean(p.ledgerAction && p.ledgerAccount),
    CustomerMessageSheet:
      Boolean(p.messageOffer) ||
      (p.messageSheet === "order" && Boolean(p.messageOrderId)) ||
      (p.messageSheet === "template" && Boolean(p.messageEvent)) ||
      p.messageSheet === "compose-all",
    DomainSheet: Boolean(p.domainMode),
    FinanceMovementDetailsSheet: Boolean(p.financeMovement),
    FinanceSheet: Boolean(p.financeSheet),
    InventoryOperationDetailsSheet:
      Boolean(p.inventoryOperation) &&
      !INVENTORY_OPERATION_MODES.some((mode) => mode === p.inventoryOperation),
    OrderDetailsSheet: p.orderSheet === "details" && Boolean(p.orderId),
    PrescriptionRequestSheet: Boolean(p.prescriptionSheet),
    PurchaseBillDetailsSheet: Boolean(p.purchaseBill),
    PurchaseRegistrationDetailsSheet: Boolean(p.purchaseRegistration),
    ReceiptSheet: Boolean(p.receiptIds?.length),
    ServiceCommerceSheet: Boolean(p.serviceCommerceSheet),
    StaffAccessSheet: p.staffAccessEvent !== null,
    StaffActivitySheet: p.staffActivity !== null,
    StaffDirectorySheet: p.staffDirectory !== null,
    StaffHistorySheet: p.staffHistory !== null,
    StaffInvitationSheet: p.staffInvitation !== null,
    StaffMemberSheet: p.staffMember !== null,
    StaffStatusSheet: p.staffStatusEvent !== null,
    StockCountSheet: Boolean(p.inventoryCount),
    StockTransferDetailsSheet: Boolean(p.stockTransfer),
    StoreConversationSheet:
      p.conversationSheet === "detail" && Boolean(p.conversationId),
    StoreSettingsSheet: p.storeSettings !== null,
  }
}
