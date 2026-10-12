import { Prisma } from "../../../generated/prisma/client"
import { literalContains } from "../literal-contains"

/** Canonical linear debt/credit projection shared by account and whole-scope reports. */
export function customerLedgerTotalsFromAggregates(input: {
  debit: bigint
  credit: bigint
  allocations: bigint
  releases: bigint
}) {
  const allocated = input.allocations - input.releases
  return {
    debitMinor: input.debit.toString(),
    creditMinor: input.credit.toString(),
    allocatedMinor: allocated.toString(),
    outstandingDebtMinor: (input.debit - allocated).toString(),
    availableCreditMinor: (input.credit - allocated).toString(),
    netBalanceMinor: (input.debit - input.credit).toString(),
  }
}
/** All matching accounts at each saved posting sequence; never an account-page sum. */
export async function getCustomerLedgerScopeTotalsInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; currencyCode: string; query?: string },
) {
  const query = input.query?.trim()
  const search = query ? `%${literalContains(query)}%` : null
  const result = await tx.$queryRaw<
    Array<{
      accountCount: string
      debit: string
      credit: string
      allocations: string
      releases: string
    }>
  >(Prisma.sql`
    SELECT COUNT(*)::text AS "accountCount", COALESCE(SUM(e.debit),0)::text AS debit,
      COALESCE(SUM(e.credit),0)::text AS credit, COALESCE(SUM(a.amount),0)::text AS allocations, COALESCE(SUM(r.amount),0)::text AS releases
    FROM "CustomerLedgerAccount" account JOIN "Customer" c ON c.id = account."customerId" AND c."tenantId" = account."tenantId"
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") FILTER (WHERE side = 'DEBIT') AS debit, SUM("amountMinor") FILTER (WHERE side = 'CREDIT') AS credit
      FROM "CustomerLedgerEntry" WHERE "accountId" = account.id AND sequence <= account."lastSequence") e ON TRUE
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerLedgerAllocation" WHERE "accountId" = account.id AND sequence <= account."lastSequence") a ON TRUE
    LEFT JOIN LATERAL (SELECT SUM(rel."amountMinor") AS amount FROM "CustomerLedgerAllocationRelease" rel
      JOIN "CustomerLedgerAllocation" allocation ON allocation.id = rel."allocationId"
      WHERE allocation."accountId" = account.id AND allocation.sequence <= account."lastSequence" AND rel.sequence <= account."lastSequence") r ON TRUE
    WHERE account."tenantId" = ${input.tenantId} AND account."currencyCode" = ${input.currencyCode}
      ${search ? Prisma.sql`AND (c.name ILIKE ${search} OR c.phone ILIKE ${search} OR c.email ILIKE ${search})` : Prisma.empty}
  `)
  const row = result[0]
  if (!row) throw new Error("Customer ledger aggregate unavailable.")
  return {
    accountCount: row.accountCount,
    totals: customerLedgerTotalsFromAggregates({
      debit: BigInt(row.debit),
      credit: BigInt(row.credit),
      allocations: BigInt(row.allocations),
      releases: BigInt(row.releases),
    }),
  }
}
