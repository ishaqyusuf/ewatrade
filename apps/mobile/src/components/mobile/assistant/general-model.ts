import type {
  GeneralAnswer,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import {
  type ReadRecordOrigin,
  readRecordTargetSchema,
} from "@ewatrade/assistant/general/read-record-target"
import { serviceRequestReadTargetSchema } from "@ewatrade/assistant/general/service-request-read"
import {
  generalSavedSnapshot,
  generalSnapshotSchema,
} from "@ewatrade/assistant/general/snapshot"
import type { StaffActivityRecordRef } from "@ewatrade/assistant/general/staff-activity-target"
import { z } from "zod"
import { nativeBusinessReportRoute } from "./native-business-report-target"
import { nativeCashReadRoute } from "./native-cash-target"
import {
  nativeServiceOriginalRoute,
  nativeServiceReceiptRoute,
} from "./native-service-target"
import { nativeStaffReadRoute } from "./native-staff-read-target"
import { nativeStaffOriginalRoute } from "./native-staff-target"
import {
  nativeStockOriginalRoute,
  nativeStockReceiptOriginal,
} from "./native-stock-state"
import { nativeStockAnswerRoute } from "./native-stock-target"
export {
  type GeneralSnapshot,
  generalAnswers,
  generalPlainText,
  generalSavedSnapshot,
  generalSnapshotSchema,
  readGeneralSnapshot,
} from "@ewatrade/assistant/general/snapshot"
const cacheSchema = z.object({
  scope: z.string(),
  savedAt: z.number(),
  data: generalSnapshotSchema,
})
export function readGeneralCache(
  raw: string | null,
  scope: string,
  now = Date.now(),
) {
  if (!raw || raw.length > 512_000) return null
  try {
    const parsed = cacheSchema.safeParse(JSON.parse(raw))
    if (
      !parsed.success ||
      parsed.data.scope !== scope ||
      now - parsed.data.savedAt > 24 * 60 * 60 * 1000 ||
      parsed.data.savedAt > now + 60_000
    )
      return null
    return { ...parsed.data, data: generalSavedSnapshot(parsed.data.data) }
  } catch {
    return null
  }
}
/**
 * The exact native object for a receipt, or null when this app has no screen
 * for it. Never fall back to another record type: an Order screen opened with a
 * stock count or bill ID shows the wrong object or a false "not found".
 */
export function generalReceiptRoute(
  receipt: GeneralReceipt,
  activeStoreId?: string | null,
) {
  const serviceOriginal = nativeServiceReceiptRoute(receipt)
  if (serviceOriginal) return serviceOriginal
  switch (receipt.kind) {
    case "finance_cash_count":
      return nativeCashReadRoute({
        kind: receipt.kind,
        bookId: receipt.bookId,
        countId: receipt.recordId,
      })
    case "staff_invitation":
      return nativeStaffOriginalRoute({
        kind: receipt.kind,
        commandId: receipt.recordId,
      })
    case "staff_status":
    case "staff_access":
      return nativeStaffOriginalRoute({
        kind: receipt.kind,
        eventId: receipt.recordId,
      })
    case "finance_movement":
      return receipt.bookId?.trim()
        ? {
            pathname: "/finance-movement/[entryId]" as const,
            params: { entryId: receipt.recordId, bookId: receipt.bookId },
          }
        : null
    case "finance_bill":
      return receipt.bookId?.trim()
        ? {
            pathname: "/finance-expense/[billId]" as const,
            params: { billId: receipt.recordId, bookId: receipt.bookId },
          }
        : null
    // Native settings screens show the current Store; another Store's
    // receipt has no exact native object here.
    case "store_receipt_settings":
      return receipt.recordId === activeStoreId
        ? { pathname: "/receipt-settings-modal" as const, params: {} }
        : null
    case "store_reminder_settings":
      return receipt.recordId === activeStoreId
        ? { pathname: "/order-reminder-settings-modal" as const, params: {} }
        : null
    case "store_order_visibility":
      return receipt.recordId === activeStoreId
        ? { pathname: "/staff-invite-modal" as const, params: {} }
        : null
    case "customer":
      return {
        pathname: "/customer-ledger/[customerId]" as const,
        params: { customerId: receipt.recordId },
      }
    case "product":
      return {
        pathname: "/catalog-item/[catalogItemId]" as const,
        params: { catalogItemId: receipt.recordId },
      }
    case "order":
      return {
        pathname: "/order/[orderId]" as const,
        params: { orderId: receipt.orderId ?? receipt.recordId },
      }
    case "payment":
      // A payment opens its Order only through the stored link; a payment ID
      // is never an Order ID.
      return receipt.orderId
        ? {
            pathname: "/order/[orderId]" as const,
            params: { orderId: receipt.orderId },
          }
        : null
    // Stock receipts carry no Store: the original opens only in the active
    // Store, and never falls back to the related catalog item.
    case "inventory":
    case "stock_count":
    case "stock_transfer":
    case "inventory_closeout": {
      const original = nativeStockReceiptOriginal(receipt)
      return original ? nativeStockOriginalRoute(original) : null
    }
    default:
      return null
  }
}

/** Where an answer card's Open goes natively, or null when it has none. */
export function generalAnswerRoute(
  target: GeneralAnswer["target"],
  currentScope?: ReadRecordOrigin | null,
) {
  const request = serviceRequestReadTargetSchema.safeParse(target)
  if (request.success) {
    if (
      !currentScope ||
      currentScope.tenantId !== request.data.origin.tenantId ||
      currentScope.storeId !== request.data.origin.storeId
    )
      return null
    return nativeServiceOriginalRoute(request.data)
  }
  const record = readRecordTargetSchema.safeParse(target)
  if (record.success) {
    if (
      !currentScope ||
      currentScope.tenantId !== record.data.origin.tenantId ||
      currentScope.storeId !== record.data.origin.storeId
    )
      return null
    if (record.data.kind === "catalog_item")
      return {
        pathname: "/catalog-item/[catalogItemId]" as const,
        params: { catalogItemId: record.data.catalogItemId },
      }
    if (record.data.kind === "order")
      return {
        pathname: "/order/[orderId]" as const,
        params: { orderId: record.data.orderId },
      }
    // Customer directory/detail has no exact native screen; never substitute ledger.
    return null
  }
  if (target?.kind === "business_report") {
    const report = nativeBusinessReportRoute(target)
    if (
      !report ||
      !currentScope ||
      target.origin.tenantId !== currentScope.tenantId ||
      (target.origin.storeId !== null &&
        target.origin.storeId !== currentScope.storeId)
    )
      return null
    return report
  }
  const stockOriginal = nativeStockAnswerRoute(target, currentScope)
  if (stockOriginal) return stockOriginal
  const cashRead = nativeCashReadRoute(target)
  if (cashRead) return cashRead
  const serviceOriginal = nativeServiceOriginalRoute(target)
  if (serviceOriginal) return serviceOriginal
  const staffRead = nativeStaffReadRoute(target)
  if (staffRead) return staffRead
  const staffOriginal = nativeStaffOriginalRoute(target)
  if (staffOriginal) return staffOriginal
  if (target?.kind !== "staff_activity") return null
  return {
    pathname: "/staff-activity-modal" as const,
    params: { target: JSON.stringify(target) },
  }
}

/** The exact native object for one shown activity event, or null. */
export function staffActivityRecordRoute(record: StaffActivityRecordRef) {
  switch (record.kind) {
    case "order":
      return {
        pathname: "/order/[orderId]" as const,
        params: { orderId: record.id },
      }
    case "payment":
      return {
        pathname: "/order/[orderId]" as const,
        params: { orderId: record.orderId },
      }
    case "product":
      return {
        pathname: "/catalog-item/[catalogItemId]" as const,
        params: { catalogItemId: record.id },
      }
    // Stock, service and finance originals have no native screen yet.
    default:
      return null
  }
}

/**
 * Whether one freshly authorized event opens natively here. Orders open only
 * in their own Store (the active Store is never switched for them).
 */
export function staffActivityOpen(
  event: {
    record: StaffActivityRecordRef
    store: { id: string; name: string | null } | null
  },
  activeStoreId: string | null | undefined,
) {
  const route = staffActivityRecordRoute(event.record)
  if (!route) return { unavailable: "Open this record on the dashboard." }
  if (
    event.record.kind !== "product" &&
    event.store &&
    event.store.id !== activeStoreId
  )
    return {
      unavailable: `Switch to ${event.store.name ?? "its Store"} to open.`,
    }
  return { route }
}
