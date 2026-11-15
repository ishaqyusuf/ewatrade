import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { readFinanceBillsInSnapshot } from "./bill-reads"
import { getFinanceManagerBookSnapshot } from "./manager-snapshot"
import { readFinanceOwedSummaryInSnapshot } from "./owed-reads"
import type { FinanceReadBookScope } from "./read-book-scope"
import { readFinanceAccountBalancesInSnapshot } from "./reads"
import { FinanceError } from "./rules"

/**
 * The Finance Overview's three panels (balances, who owes what, the latest
 * expenses) from one RepeatableRead snapshot and one admission. Each part has
 * exactly the shape of `finance.balances`, `finance.owedSummary` and
 * `finance.bills`, which keep working on their own for other callers.
 */
export async function getFinanceOverview(
  db: PrismaClient,
  input: FinanceActor & FinanceReadBookScope & { billLimit?: number },
) {
  const billLimit = input.billLimit ?? 5
  if (!Number.isInteger(billLimit) || billLimit < 1 || billLimit > 50)
    throw new FinanceError("INVALID_JOURNAL", "Invalid expense filters.")
  const scope: FinanceReadBookScope =
    "bookId" in input
      ? { bookId: input.bookId }
      : { currentCurrency: input.currentCurrency }
  const actor = { tenantId: input.tenantId, actorUserId: input.actorUserId }
  return db.$transaction(
    async (tx) => {
      const book = await getFinanceManagerBookSnapshot(tx, {
        ...actor,
        ...scope,
      })
      // One connection: the reads run in turn inside the same snapshot.
      const balances = await readFinanceAccountBalancesInSnapshot(
        tx,
        scope,
        book,
      )
      const owed = await readFinanceOwedSummaryInSnapshot(
        tx,
        { ...actor, ...scope },
        book,
      )
      const bills = await readFinanceBillsInSnapshot(
        tx,
        { ...actor, ...scope, limit: billLimit },
        book,
      )
      return { balances, owed, bills }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
