import { createHash } from "node:crypto"
import type { CommercialOrder, Prisma } from "../../../generated/prisma/client"
import type { resolveCommerceInventoryCostPosting } from "./inventory-cost-posting-source"
import { FinanceError } from "./rules"
const ZERO = BigInt(0)
function conflict(message: string): never { throw new FinanceError("CONFLICT", message) }

/** Read-only journal eligibility after original return-cost provenance validation. */
export async function reviewProductReturnJournal(tx: Prisma.TransactionClient, input: {
  tenantId: string; bookId: string; productReturnId: string; sourceCostMinor: bigint
  order: Pick<CommercialOrder, "id" | "storeId" | "createdByUserId" | "completedAt">
  historical?: boolean
  resolveGross: () => ReturnType<typeof resolveCommerceInventoryCostPosting>
}) {
  const { order } = input
  // Re-derive gross COGS from the complete original issue ledger, then require
  // its immutable journal before permitting any returned-cost recognition.
  const grossEntry = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: input.bookId,
        sourceKind: "COMMERCIAL_ORDER_COGS",
        sourceId: order.id,
      },
    },
    include: { lines: { include: { account: true } } },
  })
  if (!grossEntry) return null
  const gross = await input.resolveGross()
  if (!gross) return null
  const grossAmount = BigInt(gross.input.lines[0]?.amountMinor ?? "0")
  if (
    grossEntry.reversalOfId !== null ||
    grossEntry.storeId !== order.storeId ||
    grossEntry.actorUserId !== order.createdByUserId ||
    grossEntry.effectiveAt.getTime() !== order.completedAt?.getTime() ||
    grossEntry.lines.length !== 2 ||
    grossEntry.lines.filter(
      (line) =>
        line.account.code === "5000" &&
        line.account.kind === "EXPENSE" &&
        line.account.purpose === "COST_OF_SALES" &&
        line.debitMinor === grossAmount &&
        line.creditMinor === ZERO,
    ).length !== 1 ||
    grossEntry.lines.filter(
      (line) =>
        line.account.code === "1300" &&
        line.account.kind === "ASSET" &&
        line.account.purpose === "INVENTORY" &&
        line.creditMinor === grossAmount &&
        line.debitMinor === ZERO,
    ).length !== 1 ||
    grossAmount <= ZERO
  )
    conflict(
      "The original Product Order COGS journal is missing or inconsistent.",
    )
  const grossReversal = await tx.financeJournalEntry.findFirst({
    where: { bookId: input.bookId, reversalOfId: grossEntry.id },
    select: { id: true },
  })
  if (grossReversal)
    conflict("The original Product Order COGS journal is no longer active.")

  const orderReturns = await tx.productReturn.findMany({
    where: { tenantId: input.tenantId, orderId: order.id },
    select: {
      id: true,
      disposition: true,
      financeCost: { select: { sourceCostMinor: true } },
    },
  })
  const priorEntries = await tx.financeJournalEntry.findMany({
    where: {
      bookId: input.bookId,
      sourceKind: "PRODUCT_RETURN_COGS",
      sourceId: { in: orderReturns.map((candidate) => candidate.id) },
    },
    include: { lines: { include: { account: true } } },
  })
  let priorReturnCost = ZERO
  for (const entry of priorEntries) {
    const original = orderReturns.find(
      (candidate) => candidate.id === entry.sourceId,
    )
    if (
      !original ||
      original.disposition !== "RESTOCK" ||
      original.financeCost?.sourceCostMinor == null
    )
      conflict("A Product return journal has no matching known RESTOCK source.")
    if (
      entry.storeId !== order.storeId ||
      entry.effectiveAt < grossEntry.effectiveAt ||
      entry.reversalOfId !== null ||
      entry.lines.length !== 2
    )
      conflict("A Product return journal has inconsistent scope or chronology.")
    const debit = entry.lines.find((line) => line.account.code === "1300")
    const credit = entry.lines.find((line) => line.account.code === "5000")
    if (
      !debit ||
      !credit ||
      debit.account.kind !== "ASSET" ||
      debit.account.purpose !== "INVENTORY" ||
      credit.account.kind !== "EXPENSE" ||
      credit.account.purpose !== "COST_OF_SALES" ||
      debit.debitMinor <= ZERO ||
      debit.debitMinor !== credit.creditMinor ||
      debit.debitMinor !== original.financeCost.sourceCostMinor ||
      debit.creditMinor !== ZERO ||
      credit.debitMinor !== ZERO
    )
      conflict(
        "A Product return journal does not match reserved inventory accounts.",
      )
    if (entry.sourceId !== input.productReturnId) priorReturnCost += debit.debitMinor
  }
  if (priorReturnCost + input.sourceCostMinor > grossAmount)
    conflict("Returned Product cost exceeds the original Order COGS.")
  if (input.sourceCostMinor === ZERO) return null

  const accounts = await tx.financeAccount.findMany({
    where: {
      bookId: input.bookId,
      ...(input.historical ? {} : { archivedAt: null }),
      code: { in: ["1300", "5000"] },
    },
    select: { id: true, code: true, kind: true, purpose: true },
    take: 3,
  })
  const account = (code: string, kind: string, purpose: string) => {
    const matches = accounts.filter(
      (candidate) =>
        candidate.code === code &&
        candidate.kind === kind &&
        candidate.purpose === purpose,
    )
    if (matches.length !== 1 || !matches[0]?.id.trim())
      throw new FinanceError(
        "NOT_FOUND",
        `Required inventory return account ${code} is unavailable.`,
      )
    return matches[0].id
  }

  return {
    revision: createHash("sha256").update(JSON.stringify({ grossEntry, gross: gross.input, orderReturns, priorEntries, accounts }, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex"),
    grossEffectiveAt: grossEntry.effectiveAt,
    inventoryAccountId: account("1300", "ASSET", "INVENTORY"),
    costOfSalesAccountId: account("5000", "EXPENSE", "COST_OF_SALES"),
    grossAmount, priorReturnCost,
  }
}
