import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"

const entrySelection = {
  id: true,
  sequence: true,
  kind: true,
  side: true,
  amountMinor: true,
  sourceKind: true,
  sourceId: true,
  orderId: true,
  storeId: true,
  actorUserId: true,
  effectiveAt: true,
  recordedAt: true,
  description: true,
  reversalOfId: true,
} as const

/** Current correction context; every write independently revalidates its source. */
export async function getCustomerLedgerEntryDetail(
  db: PrismaClient,
  input: FinanceActor & {
    accountId: string
    entryId: string
    expectedRevision?: string
    afterAllocationId?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 20
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.expectedRevision !== undefined &&
      !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision)) ||
    (input.afterAllocationId !== undefined &&
      (!input.afterAllocationId.trim() ||
        input.afterAllocationId.length > 128 ||
        input.expectedRevision === undefined))
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Use a bounded entry page and keep its reviewed account revision.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
      })
      if (!account)
        throw new FinanceError("NOT_FOUND", "Customer account not found.")
      if (
        input.expectedRevision !== undefined &&
        BigInt(input.expectedRevision) !== account.revision
      )
        throw new FinanceError(
          "CONFLICT",
          "The customer account changed. Refresh the entry before continuing.",
        )
      const entry = await tx.customerLedgerEntry.findFirst({
        where: {
          id: input.entryId,
          accountId: account.id,
          tenantId: input.tenantId,
          sequence: { lte: account.lastSequence },
        },
        select: {
          ...entrySelection,
          reversals: {
            where: { sequence: { lte: account.lastSequence } },
            select: entrySelection,
          },
          receipt: {
            select: {
              id: true,
              moneyAccountId: true,
              method: true,
              reference: true,
            },
          },
        },
      })
      if (!entry)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer entry not found in this account.",
        )
      const scope = {
        accountId: account.id,
        sequence: { lte: account.lastSequence },
        OR: [{ creditEntryId: entry.id }, { chargeEntryId: entry.id }],
      }
      const [rows, allocated, released] = await Promise.all([
        tx.customerLedgerAllocation.findMany({
          where: {
            ...scope,
            ...(input.afterAllocationId
              ? { id: { gt: input.afterAllocationId } }
              : {}),
          },
          orderBy: { id: "asc" },
          take: limit + 1,
          select: {
            id: true,
            sequence: true,
            amountMinor: true,
            actorUserId: true,
            createdAt: true,
            credit: { select: entrySelection },
            charge: { select: entrySelection },
            orderSettlement: { select: { id: true, orderId: true } },
          },
        }),
        tx.customerLedgerAllocation.aggregate({
          where: scope,
          _sum: { amountMinor: true },
        }),
        tx.customerLedgerAllocationRelease.aggregate({
          where: { allocation: scope, sequence: { lte: account.lastSequence } },
          _sum: { amountMinor: true },
        }),
      ])
      const page = rows.slice(0, limit)
      const releaseTotals = page.length
        ? await tx.customerLedgerAllocationRelease.groupBy({
            by: ["allocationId"],
            where: {
              allocationId: { in: page.map((row) => row.id) },
              sequence: { lte: account.lastSequence },
            },
            _sum: { amountMinor: true },
          })
        : []
      const releaseById = new Map(
        releaseTotals.map((row) => [
          row.allocationId,
          row._sum.amountMinor ?? BigInt(0),
        ]),
      )
      const serializeEntry = (row: (typeof entry.reversals)[number]) => ({
        ...row,
        sequence: row.sequence.toString(),
        amountMinor: row.amountMinor.toString(),
      })
      const used =
        (allocated._sum.amountMinor ?? BigInt(0)) -
        (released._sum.amountMinor ?? BigInt(0))
      const { reversals, receipt, ...entryRecord } = entry
      return {
        accountId: account.id,
        customerId: account.customerId,
        currencyCode: account.currencyCode,
        currentRevision: account.revision.toString(),
        snapshotSequence: account.lastSequence.toString(),
        entry: serializeEntry(entryRecord),
        receipt,
        reversal: reversals[0] ? serializeEntry(reversals[0]) : null,
        usedAmountMinor: used.toString(),
        remainingAmountMinor: (entry.amountMinor - used).toString(),
        reconciliationRequired: used < BigInt(0) || used > entry.amountMinor,
        allocations: page.map((row) => {
          const release = releaseById.get(row.id) ?? BigInt(0)
          return {
            id: row.id,
            sequence: row.sequence.toString(),
            amountMinor: row.amountMinor.toString(),
            releasedAmountMinor: release.toString(),
            remainingAmountMinor: (row.amountMinor - release).toString(),
            actorUserId: row.actorUserId,
            createdAt: row.createdAt,
            credit: serializeEntry(row.credit),
            charge: serializeEntry(row.charge),
            orderSettlement: row.orderSettlement,
          }
        }),
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
