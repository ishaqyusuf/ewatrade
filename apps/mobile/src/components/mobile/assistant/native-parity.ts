import type { Capability } from "@ewatrade/assistant/capabilities/types"
import type {
  GeneralActionName,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import { nativeChangeActions } from "./native-change-values"

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
  "order_attachment_add",
  ...nativeChangeActions,
])

/** Receipt kinds with an exact native object screen. */
export const nativeReceiptKinds: ReadonlySet<GeneralReceipt["kind"]> = new Set([
  "customer",
  "product",
  "order",
  "payment",
])

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
    if (!nativeReceiptKinds.has(capability.receipt as GeneralReceipt["kind"]))
      missing.push("receipt")
    return missing.length
      ? [{ id: capability.id, mode: capability.mode, missing }]
      : []
  })
}
