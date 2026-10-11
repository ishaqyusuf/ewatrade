import type { Prisma } from "../../../generated/prisma/client"
import { assertHeldCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import type { reviewProductReturnJournal } from "./product-return-journal-review"
import { FinanceError } from "./rules"

type Review = Awaited<ReturnType<typeof reviewProductReturnJournal>>
type Scope = { tenantId: string; storeId: string; orderId: string; bookId: string; sourceCostMinor: string }
const previews = new WeakMap<object, { tx: Prisma.TransactionClient; scope: Scope; review: Review }>()
const locked = new WeakMap<object, { tx: Prisma.TransactionClient; scope: Scope; review: Review; clientReturnId: string }>()

export function rememberProductReturnJournalReview(preview: object, tx: Prisma.TransactionClient, scope: Scope, review: Review) {
  previews.set(preview, { tx, scope: { ...scope }, review })
}

/** Mint only after the complete fresh impact digest matched under Book/Order locks. */
export function lockProductReturnJournalReview(preview: object, tx: Prisma.TransactionClient, heldOrder: object, scope: {
  tenantId: string; storeId: string; orderId: string; clientReturnId: string
}) {
  assertHeldCommerceFinancialOrder(tx, heldOrder, scope)
  const saved = previews.get(preview)
  previews.delete(preview)
  if (!saved) return undefined
  if (saved.tx !== tx || saved.scope.tenantId !== scope.tenantId || saved.scope.storeId !== scope.storeId || saved.scope.orderId !== scope.orderId || !scope.clientReturnId)
    throw new FinanceError("CONFLICT", "Return journal review belongs to another transaction or Order.")
  const token = {}
  locked.set(token, { ...saved, clientReturnId: scope.clientReturnId })
  return token
}

/** New cost/event rows are validated separately before consuming this prior-journal review. */
export function consumeProductReturnJournalReview(token: object, tx: Prisma.TransactionClient, scope: Scope & { clientReturnId: string }) {
  const saved = locked.get(token)
  locked.delete(token)
  if (!saved || saved.tx !== tx || saved.clientReturnId !== scope.clientReturnId ||
      saved.scope.tenantId !== scope.tenantId || saved.scope.storeId !== scope.storeId ||
      saved.scope.orderId !== scope.orderId || saved.scope.bookId !== scope.bookId ||
      saved.scope.sourceCostMinor !== scope.sourceCostMinor)
    throw new FinanceError("CONFLICT", "Return journal review is stale or belongs to another command.")
  return saved.review
}
