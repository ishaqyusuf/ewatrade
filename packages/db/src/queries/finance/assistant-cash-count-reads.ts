import type { Prisma } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

/** Bounded name/code lookup. Book and account are explicitly selected; no balance is a physical count. */
export async function listAssistantCashAccountsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    storeId: string
    bookId: string
    search?: string
    afterCode?: string
  },
) {
  await assertFinanceManager(tx, input)
  if (
    !(await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
      select: { id: true },
    }))
  )
    throw new FinanceError("NOT_FOUND", "Store not found in this business.")
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
    select: {
      id: true,
      currencyCode: true,
      startsAt: true,
      closedThrough: true,
    },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  if (
    (input.search?.length ?? 0) > 160 ||
    (input.afterCode && !/^[A-Z0-9_-]{1,32}$/i.test(input.afterCode))
  )
    throw new FinanceError("INVALID_JOURNAL", "Invalid cash account search.")
  const search = input.search?.trim()
  const rows = await tx.financeAccount.findMany({
    where: {
      bookId: book.id,
      purpose: "CASH",
      kind: "ASSET",
      archivedAt: null,
      ...(input.afterCode ? { code: { gt: input.afterCode } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
    take: 21,
  })
  const accounts = rows.slice(0, 20)
  return {
    book,
    accounts,
    nextCursor: rows.length > 20 ? (accounts.at(-1)?.code ?? null) : null,
    scope: "TENANT_BOOK_CASH_IDENTITIES" as const,
  }
}
