import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { financePostingCommandId } from "./commands"
import type { FinancePostingInput } from "./posting"
import { FinanceError, financeAmount } from "./rules"
import { recordInventoryCloseoutCostContextInTransaction } from "./valuation-closeouts"

/** Fresh source composer only; do not invoke from historical command replay. */
export async function prepareInventoryCloseoutFinanceInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; closeoutId: string; expectedBookId?: string },
): Promise<{ book: FinanceBook; inputs: FinancePostingInput[] } | null> {
  const context = await recordInventoryCloseoutCostContextInTransaction(
    tx,
    input,
  )
  if (!context || !context.source.book) return null
  const { source, events } = context
  const book = context.source.book
  const relevant = events.filter(
    (event) =>
      event.canonicalEffect.toFixed().startsWith("-") &&
      event.sourceCostMinor !== null &&
      event.sourceCostMinor > BigInt(0),
  )
  if (relevant.length === 0) return { book, inputs: [] }
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, archivedAt: null },
    select: { id: true, code: true, kind: true, purpose: true },
  })
  const account = (code: string, kind: string, purpose: string) => {
    const found = accounts.find(
      (candidate) =>
        candidate.code === code &&
        candidate.kind === kind &&
        candidate.purpose === purpose,
    )
    if (!found)
      throw new FinanceError(
        "NOT_FOUND",
        `Required closeout account ${code} is unavailable.`,
      )
    return found.id
  }
  const expenseAccountId = account("6000", "EXPENSE", "OPERATING_EXPENSE")
  const inventoryAccountId = account("1300", "ASSET", "INVENTORY")
  const inputs: FinancePostingInput[] = relevant
    .sort((a, b) => a.stockMovementId.localeCompare(b.stockMovementId))
    .map((event) => {
      const amount = event.sourceCostMinor?.toString()
      if (!amount)
        throw new FinanceError(
          "CONFLICT",
          "Closeout shortage cost disappeared.",
        )
      financeAmount(amount)
      return {
        tenantId: input.tenantId,
        actorUserId: source.operation.actorUserId,
        bookId: book.id,
        clientCommandId: financePostingCommandId(
          `inventory-closeout:INVENTORY_CLOSEOUT_SHORTAGE:${event.stockMovementId}`,
          "posting",
        ),
        sourceKind: "INVENTORY_CLOSEOUT_SHORTAGE",
        sourceId: event.stockMovementId,
        effectiveAt: source.operation.effectiveAt,
        storeId: source.closeout.storeId,
        description: `Custody closeout shortage: ${source.closeout.id}`,
        lines: [
          { accountId: expenseAccountId, side: "DEBIT", amountMinor: amount },
          {
            accountId: inventoryAccountId,
            side: "CREDIT",
            amountMinor: amount,
          },
        ],
      }
    })
  return { book, inputs }
}
