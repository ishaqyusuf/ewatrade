import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

const PERIOD_KINDS = ["PERIOD_CLOSE", "PERIOD_REOPEN"]

export type FinancePeriodAuditInput = FinanceActor & {
  bookId: string
  cursor?: string
  limit?: number
}

/** Keyset history of immutable close/reopen commands, including earlier reclosures.
 * This is live audit history; Book journal sequence does not version period commands.
 * Refresh from the first page to discover newly committed commands.
 */
export async function listFinancePeriodAudit(
  db: PrismaClient,
  input: FinancePeriodAuditInput,
) {
  const limit = input.limit ?? 30
  const validId = (id: string) =>
    typeof id === "string" && id.trim().length > 0 && id.length <= 128
  if (
    !validId(input.bookId) ||
    (input.cursor !== undefined && !validId(input.cursor)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid period audit page.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true },
      })
      if (!book) {
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      }
      const scope: Prisma.FinanceCommandWhereInput = {
        bookId: book.id,
        kind: { in: PERIOD_KINDS },
      }
      const cursor = input.cursor
        ? await tx.financeCommand.findFirst({
            where: { ...scope, id: input.cursor },
            select: { id: true, createdAt: true },
          })
        : null
      if (input.cursor && !cursor) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The audit cursor is outside this book's period history.",
        )
      }
      const rows = await tx.financeCommand.findMany({
        where: cursor
          ? {
              ...scope,
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : scope,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          kind: true,
          actorUserId: true,
          createdAt: true,
          result: true,
        },
      })
      const events = rows.slice(0, limit)
      return {
        events,
        nextCursor: rows.length > limit ? (events.at(-1)?.id ?? null) : null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
