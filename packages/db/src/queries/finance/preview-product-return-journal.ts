import { rememberProductReturnJournalReview } from "./product-return-journal-review-snapshot"
import type { Prisma } from "../../../generated/prisma/client"
import { resolveCommerceInventoryCostPosting } from "./inventory-cost-posting-source"
import { reviewProductReturnJournal } from "./product-return-journal-review"
import { FinanceError } from "./rules"

/** No customer credit or money movement is implied by an inventory/COGS journal. */
export async function previewProductReturnJournal(db: Prisma.TransactionClient, input: {
  tenantId: string; storeId: string; orderId: string; disposition: string
  bookId: string | null; sourceCostMinor: string | null
}) {
  if (!input.bookId) return { status: "NO_FINANCE_BOOK" as const }
  if (input.disposition !== "restock") return { status: "NO_RESTOCK_JOURNAL" as const }
  if (input.sourceCostMinor === null) return { status: "UNKNOWN_ORIGINAL_COST" as const }
  const order = await db.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId, storeId: input.storeId },
  })
  if (!order) throw new FinanceError("NOT_FOUND", "Order not found in this Store.")
  if (order.status !== "COMPLETED" || !order.completedAt) return { status: "WAITING_FOR_ORDER_COMPLETION" as const }
  const reviewed = await reviewProductReturnJournal(db, {
    tenantId: input.tenantId, bookId: input.bookId, order, productReturnId: "",
    sourceCostMinor: BigInt(input.sourceCostMinor),
    resolveGross: () => resolveCommerceInventoryCostPosting(db, { tenantId: input.tenantId, orderId: order.id }),
  })
  const result = !reviewed ? { status: input.sourceCostMinor === "0" ? "ZERO_COST" as const : "WAITING_FOR_ORIGINAL_COGS" as const } : {
    status: "WILL_POST" as const, amountMinor: input.sourceCostMinor,
    debitAccountId: reviewed.inventoryAccountId, creditAccountId: reviewed.costOfSalesAccountId,
    debit: "Inventory", credit: "Cost of sales",
    earliestEffectiveAt: reviewed.grossEffectiveAt.toISOString(),
    revision: reviewed.revision,
  }
  rememberProductReturnJournalReview(result, db, { ...input, bookId: input.bookId, sourceCostMinor: input.sourceCostMinor }, reviewed)
  return result
}
