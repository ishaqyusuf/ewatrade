import {
  type MoneyAccountPurpose,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

/** Identity lookup only: these accounts do not establish bank/provider availability. */
export async function listFinanceMoneyAccounts(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; afterCode?: string; limit?: number },
) {
  const limit = input.limit ?? 20
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.afterCode !== undefined &&
      !/^[A-Z0-9_-]{1,32}$/i.test(input.afterCode))
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid money account page.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: {
          id: true,
          currencyCode: true,
          startsAt: true,
          closedThrough: true,
        },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const rows = await tx.financeAccount.findMany({
        where: {
          bookId: book.id,
          archivedAt: null,
          kind: "ASSET",
          purpose: { in: ["CASH", "BANK", "CLEARING"] },
          ...(input.afterCode === undefined
            ? {}
            : { code: { gt: input.afterCode } }),
        },
        select: {
          id: true,
          code: true,
          name: true,
          purpose: true,
          paymentMethods: true,
          paymentsPausedAt: true,
        },
        orderBy: { code: "asc" },
        take: limit + 1,
      })
      const accounts = rows
        .slice(0, limit)
        .map(({ paymentMethods, paymentsPausedAt, ...account }) => ({
          ...account,
          paymentMethods: moneyAccountPaymentMethods({
            purpose: account.purpose as MoneyAccountPurpose,
            paymentMethods,
          }),
          availableForPayments: paymentsPausedAt === null,
        }))
      return {
        book,
        accounts,
        nextCursor: rows.length > limit ? (accounts.at(-1)?.code ?? null) : null,
        coverage: "ACTIVE_MONEY_ACCOUNT_IDENTITIES" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
