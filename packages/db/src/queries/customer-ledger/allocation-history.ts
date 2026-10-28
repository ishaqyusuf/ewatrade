import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { resolveCustomerAllocationAfterBilling } from "./billing-reclassification"
/** Current, revision-pinned correction history. Totals are independent of the page. */
export async function getCustomerLedgerAllocationHistory(
  db: PrismaClient,
  input: FinanceActor & {
    accountId: string
    allocationId: string
    expectedRevision: string
    afterSequence?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 20
  if (
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    (input.afterSequence !== undefined &&
      !/^(0|[1-9]\d{0,18})$/.test(input.afterSequence)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Keep the reviewed account revision and a bounded release history page.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
        select: {
          id: true,
          revision: true,
          lastSequence: true,
          currencyCode: true,
        },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer account not found in this business.",
        )
      if (account.revision !== BigInt(input.expectedRevision))
        throw new FinanceError(
          "CONFLICT",
          "The customer account changed. Refresh its allocation history before continuing.",
        )
      if (
        input.afterSequence !== undefined &&
        BigInt(input.afterSequence) > account.lastSequence
      )
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Release cursor is beyond current account history.",
        )
      const allocation = await tx.customerLedgerAllocation.findFirst({
        where: {
          id: input.allocationId,
          accountId: account.id,
          sequence: { lte: account.lastSequence },
        },
        select: {
          id: true,
          amountMinor: true,
          sequence: true,
          creditEntryId: true,
          chargeEntryId: true,
          actorUserId: true,
          createdAt: true,
          charge: { select: { sourceKind: true } },
        },
      })
      if (!allocation)
        throw new FinanceError(
          "NOT_FOUND",
          "Allocation not found in this customer account.",
        )
      const scope = {
        allocationId: allocation.id,
        sequence: { lte: account.lastSequence },
      }
      const [rows, total] = await Promise.all([
        tx.customerLedgerAllocationRelease.findMany({
          where: {
            ...scope,
            ...(input.afterSequence
              ? {
                  sequence: {
                    lte: account.lastSequence,
                    gt: BigInt(input.afterSequence),
                  },
                }
              : {}),
          },
          orderBy: { sequence: "asc" },
          take: limit + 1,
          select: {
            id: true,
            sequence: true,
            amountMinor: true,
            reason: true,
            actorUserId: true,
            createdAt: true,
            orderSettlementReversal: { select: { id: true, orderId: true } },
          },
        }),
        tx.customerLedgerAllocationRelease.aggregate({
          where: scope,
          _sum: { amountMinor: true },
        }),
      ])
      const currentAllocationId =
        allocation.charge?.sourceKind === "CUSTOMER_UNBILLED_ORDER_CREDIT"
          ? await resolveCustomerAllocationAfterBilling(tx, {
              tenantId: input.tenantId,
              accountId: account.id,
              allocationId: allocation.id,
            })
          : allocation.id
      const replacement =
        currentAllocationId !== allocation.id
          ? await tx.customerLedgerAllocation.findFirst({
              where: {
                id: currentAllocationId,
                accountId: account.id,
                sequence: { lte: account.lastSequence },
              },
              select: { amountMinor: true },
            })
          : null
      const currentReleases = replacement
        ? await tx.customerLedgerAllocationRelease.aggregate({
            where: {
              allocationId: currentAllocationId,
              sequence: { lte: account.lastSequence },
            },
            _sum: { amountMinor: true },
          })
        : null
      const released = total._sum.amountMinor ?? BigInt(0)
      const currentRemaining = replacement
        ? replacement.amountMinor - (currentReleases?._sum.amountMinor ?? 0n)
        : allocation.amountMinor - released
      const { charge: _charge, ...allocationRecord } = allocation
      const page = rows.slice(0, limit)
      return {
        accountId: account.id,
        currencyCode: account.currencyCode,
        currentRevision: account.revision.toString(),
        allocation: {
          ...allocationRecord,
          amountMinor: allocation.amountMinor.toString(),
          sequence: allocation.sequence.toString(),
        },
        currentAllocationId,
        currentRemainingAmountMinor: currentRemaining.toString(),
        releasedAmountMinor: released.toString(),
        remainingAmountMinor: (allocation.amountMinor - released).toString(),
        reconciliationRequired:
          released < BigInt(0) || released > allocation.amountMinor,
        releases: page.map((row) => ({
          ...row,
          sequence: row.sequence.toString(),
          amountMinor: row.amountMinor.toString(),
        })),
        nextCursor:
          rows.length > limit
            ? (page.at(-1)?.sequence.toString() ?? null)
            : null,
        coverage: "POSTED_CUSTOMER_LEDGER_ENTRIES" as const,
        completeness: "INCOMPLETE_SOURCE_COVERAGE" as const,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
