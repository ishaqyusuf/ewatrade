import type { Capability } from "@ewatrade/assistant/capabilities/types"
import type {
  GeneralActionName,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import { nativeChangeActions } from "./native-change-values"
import { nativeMoneyActions } from "./native-money-values"
import { nativeOrderActions } from "./native-order-values"
import { nativeServiceWorkActions } from "./native-service-work-values"
import { nativeStockActions } from "./native-stock-values"

/**
 * What the native Ask UI can actually render. A capability may declare the
 * `mobile` client only when its draft has a native editor and its receipt opens
 * the exact native object; `native-parity.test.ts` enforces this, so declaring
 * a client can never outrun the app.
 */
export const nativeEditorActions: ReadonlySet<GeneralActionName> = new Set([
  "customer_create",
  "customer_update",
  "product_create",
  "payment_record",
  "order_create",
  "sale_record",
  "staff_status",
  "staff_invitation",
  "staff_access",
  "service_intake",
  "service_message_share",
  "cash_count_record",
  "commerce_quote_approve",
  "commerce_quote_reject",
  ...nativeServiceWorkActions,
  "order_attachment_add",
  ...nativeChangeActions,
  ...nativeOrderActions,
  ...nativeMoneyActions,
  ...nativeStockActions,
])

/** Receipt kinds with an exact native object screen. */
export const nativeReceiptKinds: ReadonlySet<GeneralReceipt["kind"]> = new Set([
  "customer",
  "product",
  "order",
  "payment",
  "finance_movement",
  "finance_bill",
  "finance_cash_count",
  "staff_status",
  "staff_access",
  "staff_invitation",
  "service_intake",
  "service_work",
  "service_work_note",
  "service_work_exception",
  "commerce_quote_decision",
  "service_manual_message",
  "store_receipt_settings",
  "store_reminder_settings",
  "store_order_visibility",
  "inventory",
  "stock_count",
  "stock_transfer",
  "inventory_closeout",
])

/** Manifest receipt labels whose capability saves one of several kinds. */
const receiptFamilies: Record<string, readonly string[]> = {
  store_settings: [
    "store_receipt_settings",
    "store_reminder_settings",
    "store_order_visibility",
  ],
}

export type NativeParityGap = {
  id: string
  mode: Capability["mode"]
  missing: Array<"editor" | "receipt">
}

/** Capabilities the native app cannot fully render, declared or not. */
export function nativeParityGaps(manifest: readonly Capability[]) {
  return manifest.flatMap((capability): NativeParityGap[] => {
    if (capability.mode === "read") return []
    const missing: NativeParityGap["missing"] = []
    if (!nativeEditorActions.has(capability.action as GeneralActionName))
      missing.push("editor")
    const kinds = receiptFamilies[capability.receipt] ?? [capability.receipt]
    if (
      !kinds.every((kind) =>
        nativeReceiptKinds.has(kind as GeneralReceipt["kind"]),
      )
    )
      missing.push("receipt")
    return missing.length
      ? [{ id: capability.id, mode: capability.mode, missing }]
      : []
  })
}
