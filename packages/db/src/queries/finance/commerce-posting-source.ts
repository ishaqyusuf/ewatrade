import type { Prisma } from "../../../generated/prisma/client"
import { readCommercialOrderEarnedCompletion } from "../commercial-order-completion"
import { lockCommerceFinancialOrder } from "../customer-ledger/commerce-locks"
import { financePostingCommandId } from "./commands"
import type { FinancePostingInput } from "./posting"
import { FinanceError } from "./rules"

export type CommerceFinanceSource = {
  tenantId: string
  orderId: string
} & ({ event: "BILLED" | "EARNED" } | { event: "PAYMENT"; paymentId: string })

/** No caller-supplied amounts, accounts, actor or effective date. */
export async function resolveCommerceFinancePosting(
  tx: Prisma.TransactionClient,
  source: CommerceFinanceSource,
) {
  const locked = await lockCommerceFinancialOrder(tx, source)
  if (!locked?.context) return null
  const { context, order } = locked
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: context.bookId },
  })
  if (!order || order.currencyCode !== book.currencyCode)
    throw new FinanceError(
      "CONFLICT",
      "Commerce source and financial book must have matching ownership and currency.",
    )
  const payment =
    source.event === "PAYMENT"
      ? await tx.commercialOrderPayment.findFirst({
          where: {
            id: source.paymentId,
            tenantId: source.tenantId,
            orderId: order.id,
          },
        })
      : null
  if (source.event === "PAYMENT" && !payment)
    throw new FinanceError(
      "NOT_FOUND",
      "Payment source not found for this Order.",
    )
  // Its allocation/release already moves receivables against held credit.
  if (payment?.method === "CUSTOMER_CREDIT") return null
  if (
    source.event === "EARNED" &&
    (order.status !== "COMPLETED" ||
      !order.completedAt ||
      !(await readCommercialOrderEarnedCompletion(tx, {
        orderId: order.id,
        storeId: order.storeId,
        tenantId: source.tenantId,
      })))
  )
    return null
  if (order.totalMinor === 0 && source.event !== "PAYMENT") return null
  if (
    source.event === "BILLED" &&
    ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(order.status)
  )
    throw new FinanceError(
      "CONFLICT",
      "Only a confirmed commercial obligation can be billed.",
    )
  if (order.taxMinor < 0 || order.taxMinor > order.totalMinor)
    throw new FinanceError("INVALID_AMOUNT", "Order tax exceeds its total.")
  if (source.event !== "BILLED") {
    const billing = await tx.financeJournalEntry.findUnique({
      where: {
        bookId_sourceKind_sourceId: {
          bookId: book.id,
          sourceKind: "COMMERCIAL_ORDER_BILLED",
          sourceId: order.id,
        },
      },
    })
    if (!billing)
      throw new FinanceError(
        "CONFLICT",
        "Reconcile the Order's billing or opening balance before posting its financial activity.",
      )
  }
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, archivedAt: null },
  })
  function account(code: string, purpose: string, kind: string) {
    const found = accounts.find(
      (row) =>
        row.code === code && row.purpose === purpose && row.kind === kind,
    )
    if (!found)
      throw new FinanceError(
        "NOT_FOUND",
        `Required commerce account ${code} is unavailable.`,
      )
    return found.id
  }
  async function control(code: string, name: string) {
    const row = await tx.financeAccount.upsert({
      where: { bookId_code: { bookId: book.id, code } },
      create: {
        bookId: book.id,
        code,
        name,
        kind: "LIABILITY",
        purpose: "OTHER",
      },
      update: {},
    })
    if (
      row.kind !== "LIABILITY" ||
      row.purpose !== "OTHER" ||
      row.name !== name ||
      row.archivedAt
    )
      throw new FinanceError(
        "CONFLICT",
        `Reserved commerce account ${code} has incompatible settings.`,
      )
    return row.id
  }
  const receivableId = account("1200", "RECEIVABLE", "ASSET")
  const net = order.totalMinor - order.taxMinor
  const lines: FinancePostingInput["lines"] = []
  let effectiveAt = order.createdAt
  let actorUserId = order.createdByUserId
  let sourceKind = `COMMERCIAL_ORDER_${source.event}`
  let sourceId = order.id
  if (source.event === "BILLED") {
    lines.push({
      accountId: receivableId,
      side: "DEBIT",
      amountMinor: String(order.totalMinor),
    })
    if (net > 0)
      lines.push({
        accountId: await control("2250", "Billed revenue awaiting completion"),
        side: "CREDIT",
        amountMinor: String(net),
      })
    if (order.taxMinor > 0)
      lines.push({
        accountId: await control("2350", "Tax charged on orders"),
        side: "CREDIT",
        amountMinor: String(order.taxMinor),
      })
  } else if (source.event === "EARNED") {
    if (net === 0) return null
    effectiveAt = order.completedAt ?? order.createdAt
    lines.push(
      {
        accountId: await control("2250", "Billed revenue awaiting completion"),
        side: "DEBIT",
        amountMinor: String(net),
      },
      {
        accountId: account("4000", "SALES", "INCOME"),
        side: "CREDIT",
        amountMinor: String(net),
      },
    )
  } else if (payment) {
    const isRefund = payment.type === "REFUND"
    const moneyId =
      payment.method === "CASH"
        ? account("1000", "CASH", "ASSET")
        : payment.method === "BANK_TRANSFER"
          ? account("1100", "BANK", "ASSET")
          : account("1150", "CLEARING", "ASSET")
    lines.push(
      {
        accountId: moneyId,
        side: isRefund ? "CREDIT" : "DEBIT",
        amountMinor: String(payment.amountMinor),
      },
      {
        accountId: receivableId,
        side: isRefund ? "DEBIT" : "CREDIT",
        amountMinor: String(payment.amountMinor),
      },
    )
    effectiveAt = payment.recordedAt
    actorUserId = payment.recordedByUserId
    sourceKind = "COMMERCIAL_PAYMENT"
    sourceId = payment.id
  }
  const input: FinancePostingInput = {
    tenantId: source.tenantId,
    actorUserId,
    bookId: book.id,
    clientCommandId: financePostingCommandId(
      `commerce:${sourceKind}:${sourceId}`,
      "posting",
    ),
    sourceKind,
    sourceId,
    effectiveAt,
    storeId: order.storeId,
    description: `${source.event === "PAYMENT" ? "Payment activity" : source.event === "BILLED" ? "Order billed" : "Order revenue earned"}: ${order.orderNumber}`,
    lines,
  }
  return { book, input }
}
