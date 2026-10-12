import type { Prisma } from "../../../generated/prisma/client"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import { financePostingCommandId } from "./commands"
import type { FinancePostingInput } from "./posting"
import { FinanceError } from "./rules"

/** A selected payment account records cash custody without inventing historic billing. */
export async function resolveOrderCollectionPosting(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; orderId: string; paymentId: string },
) {
  const locked = await lockCommerceFinancialOrder(tx, source)
  const payment = await tx.commercialOrderPayment.findFirst({
    where: {
      id: source.paymentId,
      tenantId: source.tenantId,
      orderId: source.orderId,
    },
  })
  if (!locked?.context || !payment?.moneyAccountId)
    throw new FinanceError(
      "CONFLICT",
      "Choose a receiving account from this business's finance setup.",
    )
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: locked.context.bookId },
  })
  const money = await tx.financeAccount.findFirst({
    where: {
      id: payment.moneyAccountId,
      bookId: book.id,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      archivedAt: null,
    },
  })
  if (!money)
    throw new FinanceError(
      "CONFLICT",
      "The payment account is unavailable. Choose an active cash or bank account.",
    )
  const billing = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: "COMMERCIAL_ORDER_BILLED",
        sourceId: locked.order.id,
      },
    },
  })
  // Financially billed orders retain the existing receivable/customer-ledger path.
  if (billing) return { billed: true as const }
  const control = await tx.financeAccount.upsert({
    where: { bookId_code: { bookId: book.id, code: "2200" } },
    create: {
      bookId: book.id,
      code: "2200",
      name: "Order collections awaiting reconciliation",
      kind: "LIABILITY",
      purpose: "OTHER",
    },
    update: {},
  })
  if (
    control.archivedAt ||
    control.kind !== "LIABILITY" ||
    control.purpose !== "OTHER" ||
    control.name !== "Order collections awaiting reconciliation"
  )
    throw new FinanceError(
      "CONFLICT",
      "The order collections account requires reconciliation.",
    )
  const refund = payment.type === "REFUND"
  const input: FinancePostingInput = {
    tenantId: source.tenantId,
    actorUserId: payment.recordedByUserId,
    bookId: book.id,
    clientCommandId: financePostingCommandId(
      `order-collection:${payment.id}`,
      "posting",
    ),
    sourceKind: "COMMERCIAL_ORDER_COLLECTION",
    sourceId: payment.id,
    effectiveAt: payment.recordedAt,
    storeId: locked.order.storeId,
    description: `${refund ? "Money returned" : "Money received"}: ${locked.order.orderNumber}`,
    lines: [
      {
        accountId: money.id,
        side: refund ? "CREDIT" : "DEBIT",
        amountMinor: String(payment.amountMinor),
      },
      {
        accountId: control.id,
        side: refund ? "DEBIT" : "CREDIT",
        amountMinor: String(payment.amountMinor),
      },
    ],
  }
  return { billed: false as const, book, input }
}
