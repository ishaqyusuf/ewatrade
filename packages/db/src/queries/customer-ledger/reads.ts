import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { getCustomerLedgerTotalsInTransaction } from "./balances"

/** The customer statement is net debt/credit; allocations settle gross controls. */
export async function getCustomerLedgerStatement(
  db: PrismaClient,
  input: FinanceActor & {
    accountId: string
    snapshotSequence?: string
    afterSequence?: string
    limit?: number
  },
) {
  if (input.afterSequence !== undefined && input.snapshotSequence === undefined)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Continuation pages must keep the original statement snapshot.",
    )
  for (const value of [input.snapshotSequence, input.afterSequence]) {
    if (value !== undefined && !/^(0|[1-9]\d{0,18})$/.test(value))
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Invalid customer statement sequence.",
      )
  }
  const limit = input.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Statement pages must contain 1–100 entries.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer ledger account not found in this business.",
        )
      const snapshot =
        input.snapshotSequence === undefined
          ? account.lastSequence
          : BigInt(input.snapshotSequence)
      const after = BigInt(input.afterSequence ?? "0")
      if (snapshot > account.lastSequence || after > snapshot)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The statement snapshot or cursor is beyond available history.",
        )
      const [totals, rows] = await Promise.all([
        getCustomerLedgerTotalsInTransaction(tx, account.id, snapshot),
        tx.$queryRaw<
          Array<{
            id: string
            sequence: bigint
            kind: string
            side: string
            amountMinor: bigint
            sourceKind: string
            sourceId: string
            orderId: string | null
            storeId: string | null
            actorUserId: string
            reversalOfId: string | null
            effectiveAt: Date
            recordedAt: Date
            description: string
            runningBalanceMinor: string
          }>
        >`
        WITH statement AS (
          SELECT id, sequence, kind, side, "amountMinor", "sourceKind", "sourceId", "orderId",
            "storeId", "actorUserId", "reversalOfId",
            "effectiveAt", "recordedAt", description,
            SUM(CASE WHEN side = 'DEBIT' THEN "amountMinor" ELSE -"amountMinor" END)
              OVER (ORDER BY sequence ROWS UNBOUNDED PRECEDING)::text AS "runningBalanceMinor"
          FROM "CustomerLedgerEntry"
          WHERE "accountId" = ${account.id} AND sequence <= ${snapshot}
        )
        SELECT * FROM statement WHERE sequence > ${after}
        ORDER BY sequence LIMIT ${limit + 1}
      `,
      ])
      const page = rows.slice(0, limit)
      return {
        accountId: account.id,
        customerId: account.customerId,
        currencyCode: account.currencyCode,
        currentRevision: account.revision.toString(),
        snapshotSequence: snapshot.toString(),
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
        totals,
        entries: page.map((row) => ({
          ...row,
          sequence: row.sequence.toString(),
          amountMinor: row.amountMinor.toString(),
          runningBalanceMinor: row.runningBalanceMinor.toString(),
        })),
        nextCursor:
          rows.length > limit
            ? (page[page.length - 1]?.sequence.toString() ?? null)
            : null,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
