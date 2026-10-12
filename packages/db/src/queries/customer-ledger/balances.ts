import { customerLedgerTotalsFromAggregates } from "./totals-projection"
import type { Prisma } from "../../../generated/prisma/client"

/** Caller authorizes the account and fixes the sequence in one repeatable-read transaction. */
export async function getCustomerLedgerTotalsInTransaction(
  tx: Prisma.TransactionClient,
  accountId: string,
  snapshot: bigint,
) {
  const scope = { accountId, sequence: { lte: snapshot } }
  const [debits, credits, allocations, releases] = await Promise.all([
    tx.customerLedgerEntry.aggregate({
      where: { ...scope, side: "DEBIT" },
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerEntry.aggregate({
      where: { ...scope, side: "CREDIT" },
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerAllocation.aggregate({
      where: scope,
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerAllocationRelease.aggregate({
      where: {
        sequence: { lte: snapshot },
        allocation: { accountId, sequence: { lte: snapshot } },
      },
      _sum: { amountMinor: true },
    }),
  ])
  return customerLedgerTotalsFromAggregates({
    debit: debits._sum.amountMinor ?? BigInt(0),
    credit: credits._sum.amountMinor ?? BigInt(0),
    allocations: allocations._sum.amountMinor ?? BigInt(0),
    releases: releases._sum.amountMinor ?? BigInt(0),
  })
}
