"use client"
import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

export const assistantObjectParams = {
  staffAccessEvent: parseAsString,
  staffStatusEvent: parseAsString,
  businessReport: parseAsString,
  assistantCashCount: parseAsString,
  assistantCashBook: parseAsString,
  assistantDayCloseBook: parseAsString,
  assistantDayCloseThrough: parseAsString,
  financeSheet: parseAsString,
  billId: parseAsString,
  supplierId: parseAsString,
  purchaseBill: parseAsString,
  purchaseBillBook: parseAsString,
  purchaseRegistration: parseAsString,
  purchaseRegistrationBook: parseAsString,
  financeMovement: parseAsString,
  financeMovementBook: parseAsString,
  customerDetail: parseAsString,
  catalogDetail: parseAsString,
  catalogDetailTab: parseAsString,
  catalogActivity: parseAsString,
  orderSheet: parseAsString,
  orderId: parseAsString,
  inventoryCount: parseAsString,
  inventoryCloseout: parseAsString,
  stockTransfer: parseAsString,
  inventoryOperation: parseAsString,
  serviceIntake: parseAsString,
  serviceSheet: parseAsString,
  jobId: parseAsString,
  staffInvitation: parseAsString,
  staffMember: parseAsString,
  staffHistory: parseAsString,
  staffDirectory: parseAsString,
}

export const closedAssistantObjectParams = {
  staffAccessEvent: null,
  staffStatusEvent: null,
  businessReport: null,
  assistantCashCount: null,
  assistantCashBook: null,
  assistantDayCloseBook: null,
  assistantDayCloseThrough: null,
  financeSheet: null,
  billId: null,
  supplierId: null,
  purchaseBill: null,
  purchaseBillBook: null,
  purchaseRegistration: null,
  purchaseRegistrationBook: null,
  financeMovement: null,
  financeMovementBook: null,
  customerDetail: null,
  catalogDetail: null,
  catalogDetailTab: null,
  catalogActivity: null,
  orderSheet: null,
  orderId: null,
  inventoryCount: null,
  inventoryCloseout: null,
  stockTransfer: null,
  inventoryOperation: null,
  serviceIntake: null,
  serviceSheet: null,
  jobId: null,
  staffInvitation: null,
  staffMember: null,
  staffHistory: null,
  staffDirectory: null,
}

/** Open registered record overlays without leaving the current workspace/chat. */
export function useAssistantReceipt() {
  const [, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
    shallow: true,
  })
  return (receipt: GeneralReceipt) => {
    const closed = closedAssistantObjectParams
    switch (receipt.kind) {
      case "staff_access":
        return setParams({ ...closed, staffAccessEvent: receipt.recordId })
      case "staff_status":
        return setParams({ ...closed, staffStatusEvent: receipt.recordId })
      case "service_intake":
        return setParams({ ...closed, serviceIntake: receipt.recordId })
      case "finance_cash_count":
        return setParams({
          ...closed,
          assistantCashCount: receipt.recordId,
          assistantCashBook: receipt.bookId ?? null,
        })
      case "staff_invitation":
        return setParams({ ...closed, staffInvitation: receipt.recordId })
      case "finance_purchase_bill":
        return setParams({
          ...closed,
          purchaseBill: receipt.recordId,
          purchaseBillBook: receipt.bookId ?? null,
        })
      case "finance_purchase_registration":
        return setParams({
          ...closed,
          purchaseRegistration: receipt.recordId,
          purchaseRegistrationBook: receipt.bookId ?? null,
        })
      case "finance_supplier":
        return setParams({
          ...closed,
          financeSheet: "supplier-statement",
          supplierId: receipt.recordId,
        })
      case "finance_bill":
        return setParams({
          ...closed,
          financeSheet: "bill",
          billId: receipt.recordId,
        })
      case "finance_movement":
        return setParams({
          ...closed,
          financeMovement: receipt.recordId,
          financeMovementBook: receipt.bookId ?? null,
        })
      case "customer":
        return setParams({ ...closed, customerDetail: receipt.recordId })
      case "product":
        return setParams({ ...closed, catalogDetail: receipt.recordId })
      case "inventory":
        return setParams({ ...closed, inventoryOperation: receipt.recordId })
      case "stock_count":
        return setParams({ ...closed, inventoryCount: receipt.recordId })
      case "inventory_closeout":
        return setParams({ ...closed, inventoryCloseout: receipt.recordId })
      case "stock_transfer":
        return setParams({ ...closed, stockTransfer: receipt.recordId })
      case "order":
      case "payment":
        return setParams({
          ...closed,
          orderSheet: "details",
          orderId: receipt.orderId ?? receipt.recordId,
        })
    }
  }
}
