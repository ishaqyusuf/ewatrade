import { stockReadTargetSchema } from "@ewatrade/assistant/general/stock-read-target"
import {
  type NativeStockOriginal,
  nativeStockOriginalRoute,
} from "./native-stock-state"

/**
 * An answer card's stock record, only when the shared target is exact and
 * was produced in the current business and Store. IDs are never trimmed or
 * rewritten, and there is no fallback to a related record.
 */
export function nativeStockAnswerRoute(
  target: unknown,
  currentScope?: { tenantId: string; storeId: string } | null,
) {
  const parsed = stockReadTargetSchema.safeParse(target)
  if (
    !parsed.success ||
    !currentScope ||
    parsed.data.origin.tenantId !== currentScope.tenantId ||
    parsed.data.origin.storeId !== currentScope.storeId
  )
    return null
  const value = parsed.data
  let original: NativeStockOriginal
  switch (value.kind) {
    case "stock_operation":
      original = { kind: value.kind, operationId: value.operationId }
      break
    case "stock_count":
      original = { kind: value.kind, stockCountId: value.stockCountId }
      break
    case "stock_transfer":
      original = { kind: value.kind, transferId: value.transferId }
      break
    case "inventory_closeout":
      original = { kind: value.kind, closeoutId: value.closeoutId }
      break
  }
  return nativeStockOriginalRoute(original)
}
