import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"

/** Caller holds the customer account lock for writes; no stale sum can authorize a debit. */
export async function getCustomerFundsReservedInTransaction(
  tx: Prisma.TransactionClient,
  input: { accountId: string; creditEntryId?: string },
) {
  const rows = await tx.$queryRaw<Array<{ reservedMinor: bigint }>>`
    SELECT COALESCE(SUM("amountMinor"), 0)::bigint AS "reservedMinor"
    FROM "CustomerFundsRefundRequest"
    WHERE "accountId" = ${input.accountId} AND status = 'RESERVED'
      AND (${input.creditEntryId ?? null}::text IS NULL OR "creditEntryId" = ${input.creditEntryId ?? null})
  `
  return rows[0]?.reservedMinor ?? 0n
}

export async function assertCustomerFundsNotReserved(
  tx: Prisma.TransactionClient,
  input: { accountId: string; creditEntryId: string },
  available: bigint,
  amount: bigint,
) {
  const reserved = await getCustomerFundsReservedInTransaction(tx, input)
  if (reserved < 0n || amount > available - reserved)
    throw new FinanceError(
      "CONFLICT",
      "These customer funds are reserved for a refund. Review the available amount again.",
    )
  return reserved
}
