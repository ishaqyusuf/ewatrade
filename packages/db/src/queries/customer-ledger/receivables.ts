import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { literalContains } from "../literal-contains"
import { getCustomerLedgerTotalsInTransaction } from "./balances"

/** Bounded account page. Totals cover each complete account, never just its visible entries. */
export async function listCustomerLedgerReceivables(
  db: PrismaClient,
  input: FinanceActor & { query?: string; cursor?: string; limit?: number },
) {
  const limit = input.limit ?? 10
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10 ||
    (input.query?.length ?? 0) > 160 ||
    (input.cursor !== undefined &&
      (!input.cursor.trim() || input.cursor.length > 128))
  )
    throw new FinanceError("INVALID_JOURNAL", "Invalid receivables page.")
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const query = input.query?.trim()
      const where: Prisma.CustomerLedgerAccountWhereInput = {
        tenantId: input.tenantId,
        ...(query
          ? {
              customer: {
                OR: [
                  {
                    name: {
                      contains: literalContains(query),
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    phone: {
                      contains: literalContains(query),
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    email: {
                      contains: literalContains(query),
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            }
          : {}),
      }
      if (
        input.cursor &&
        !(await tx.customerLedgerAccount.findFirst({
          where: { AND: [where, { id: input.cursor }] },
          select: { id: true },
        }))
      )
        throw new FinanceError(
          "CONFLICT",
          "The receivables list changed. Refresh to continue.",
        )
      const rows = await tx.customerLedgerAccount.findMany({
        where: {
          ...where,
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: limit + 1,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      })
      const page = rows.slice(0, limit)
      const items: {
        id: string
        customer: (typeof page)[number]["customer"]
        currencyCode: string
        totals: Awaited<ReturnType<typeof getCustomerLedgerTotalsInTransaction>>
      }[] = []
      for (const account of page)
        items.push({
          id: account.id,
          customer: account.customer,
          currencyCode: account.currencyCode,
          totals: await getCustomerLedgerTotalsInTransaction(
            tx,
            account.id,
            account.lastSequence,
          ),
        })
      return {
        items,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        scope: "ACCOUNT_PAGE" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
