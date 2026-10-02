import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { getCustomerLedgerTotalsInTransaction } from "./balances"

const customerSelection = {
  id: true,
  name: true,
  email: true,
  phone: true,
} as const

export async function listCustomerLedgerAccounts(
  db: PrismaClient,
  input: FinanceActor & {
    customerId: string
    currencyCode?: string
    afterCurrency?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 20
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    [input.currencyCode, input.afterCurrency].some(
      (value) => value !== undefined && !/^[A-Z]{3}$/.test(value),
    )
  )
    throw new FinanceError("INVALID_JOURNAL", "Invalid customer account page.")
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, tenantId: input.tenantId },
        select: customerSelection,
      })
      if (!customer)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer not found in this business.",
        )
      const rows = await tx.customerLedgerAccount.findMany({
        where: {
          tenantId: input.tenantId,
          customerId: customer.id,
          currencyCode: {
            ...(input.currencyCode ? { equals: input.currencyCode } : {}),
            ...(input.afterCurrency ? { gt: input.afterCurrency } : {}),
          },
        },
        orderBy: { currencyCode: "asc" },
        take: limit + 1,
      })
      const page = rows.slice(0, limit)
      return {
        customer,
        accounts: page.map((account) => ({
          id: account.id,
          customerId: account.customerId,
          currencyCode: account.currencyCode,
          revision: account.revision.toString(),
          snapshotSequence: account.lastSequence.toString(),
          createdAt: account.createdAt,
        })),
        nextCursor:
          rows.length > limit ? (page.at(-1)?.currencyCode ?? null) : null,
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

/** Exact controls at the account's current sequence, independent of statement pagination. */
export async function getCustomerLedgerAccountDetail(
  db: PrismaClient,
  input: FinanceActor & { accountId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
        include: { customer: { select: customerSelection } },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer account not found in this business.",
        )
      const [totals, book] = await Promise.all([
        getCustomerLedgerTotalsInTransaction(
          tx,
          account.id,
          account.lastSequence,
        ),
        tx.financeBook.findFirst({
          where: {
            tenantId: input.tenantId,
            currencyCode: account.currencyCode,
          },
          select: { id: true, currencyCode: true, startsAt: true },
        }),
      ])
      return {
        id: account.id,
        customer: account.customer,
        currencyCode: account.currencyCode,
        revision: account.revision.toString(),
        snapshotSequence: account.lastSequence.toString(),
        book,
        totals,
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
