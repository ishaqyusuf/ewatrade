import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import {
  generalSavedSnapshot,
  generalSnapshotSchema,
} from "@ewatrade/assistant/general/snapshot"
import { z } from "zod"
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
export function generalReceiptRoute(receipt: GeneralReceipt) {
  if (receipt.kind === "customer")
    return {
      pathname: "/customer-ledger/[customerId]" as const,
      params: { customerId: receipt.recordId },
    }
  if (receipt.kind === "product")
    return {
      pathname: "/catalog-item/[catalogItemId]" as const,
      params: { catalogItemId: receipt.recordId },
    }
  return {
    pathname: "/order/[orderId]" as const,
    params: { orderId: receipt.orderId ?? receipt.recordId },
  }
}
