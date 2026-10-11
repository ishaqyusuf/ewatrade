import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { assertHeldCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import type { ProductReturnValuationEvidence } from "./product-return-evidence"
import { FinanceError } from "./rules"

type Source = { book: FinanceBook; line: ProductReturnValuationEvidence["orderLine"]; order: ProductReturnValuationEvidence["order"] }
type Scope = { tenantId: string; storeId: string; orderLineId: string; quantity: string }
const previews = new WeakMap<object, { tx: Prisma.TransactionClient; scope: Scope; source: Source }>()
const locked = new WeakMap<object, { tx: Prisma.TransactionClient; scope: Scope; source: Source; clientReturnId: string }>()

/** Internal evidence only; never serialized into proposals or accepted from clients. */
export function rememberProductReturnSource(preview: object, tx: Prisma.TransactionClient, scope: Scope, source: Source) {
  previews.set(preview, { tx, scope: { tenantId: scope.tenantId, storeId: scope.storeId, orderLineId: scope.orderLineId, quantity: scope.quantity }, source })
}
export function lockProductReturnSource(preview: object, tx: Prisma.TransactionClient, heldOrder: object, scope: Scope & { orderId: string; clientReturnId: string }) {
  assertHeldCommerceFinancialOrder(tx, heldOrder, scope)
  const saved = previews.get(preview)
  if (!saved) return undefined // No Finance Book has no source graph to reuse.
  if (saved.tx !== tx || saved.source.order.id !== scope.orderId ||
      saved.scope.tenantId !== scope.tenantId || saved.scope.storeId !== scope.storeId ||
      saved.scope.orderLineId !== scope.orderLineId || saved.scope.quantity !== scope.quantity)
    throw new FinanceError("CONFLICT", "Return source evidence belongs to another transaction or command.")
  previews.delete(preview)
  const token = {}
  if (!scope.clientReturnId) throw new FinanceError("CONFLICT", "Return command identity is required.")
  locked.set(token, { ...saved, clientReturnId: scope.clientReturnId })
  return token
}
export function consumeProductReturnSource(token: object, tx: Prisma.TransactionClient, returned: {
  tenantId: string; storeId: string; orderId: string; orderLineId: string; quantity: Prisma.Decimal; clientReturnId: string
}) {
  const saved = locked.get(token)
  locked.delete(token)
  if (!saved || saved.clientReturnId !== returned.clientReturnId || saved.tx !== tx || saved.scope.tenantId !== returned.tenantId ||
      saved.scope.storeId !== returned.storeId || saved.source.order.id !== returned.orderId ||
      saved.scope.orderLineId !== returned.orderLineId ||
      compareExactDecimals(returned.quantity.toFixed(), saved.scope.quantity) !== 0)
    throw new FinanceError("CONFLICT", "Return source evidence is stale or belongs to another command.")
  return saved.source
}
