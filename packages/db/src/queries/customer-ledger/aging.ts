import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { getCustomerLedgerTotalsInTransaction } from "./balances"

export const CUSTOMER_AGING_BUCKETS = [
  { key: "DAYS_0_30", fromDays: 0, toDays: 30 },
  { key: "DAYS_31_60", fromDays: 31, toDays: 60 },
  { key: "DAYS_61_90", fromDays: 61, toDays: 90 },
  { key: "DAYS_OVER_90", fromDays: 91, toDays: null },
] as const
export type CustomerAgingBucketKey =
  (typeof CUSTOMER_AGING_BUCKETS)[number]["key"]

const DAY_MS = 86_400_000
const MAX_LISTED_ORDERS = 20

/** Whole days between the debt date and `asOf`, never negative. */
export function customerAgingBucket(
  owedSince: Date,
  asOf: Date,
): CustomerAgingBucketKey {
  const days = Math.max(
    0,
    Math.floor((asOf.getTime() - owedSince.getTime()) / DAY_MS),
  )
  const bucket = CUSTOMER_AGING_BUCKETS.find(
    (row) =>
      days >= row.fromDays && (row.toDays === null || days <= row.toDays),
  )
  return bucket?.key ?? "DAYS_OVER_90"
}

type Amounts = { statement: bigint; orders: bigint }

/**
 * How long a customer has owed, at one account snapshot. Two separate sources:
 * - statement: unsettled remainders of posted debits (opening debt, billed
 *   Order charges), dated by their effective date;
 * - orders: unpaid balances of the customer's linked Orders that are not on the
 *   statement yet (no Order charge), dated by Order creation.
 * They never overlap: a billed Order is only counted through its charge.
 * Unused paid-ahead money is reported separately and not netted into buckets.
 */
export async function getCustomerLedgerAging(
  db: PrismaClient,
  input: FinanceActor & { accountId: string },
) {
  return db.$transaction(
    (tx) => getCustomerLedgerAgingInTransaction(tx, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

/** Caller owns a repeatable-read transaction; Owner/Admin is rechecked here. */
export async function getCustomerLedgerAgingInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { accountId: string },
) {
  await assertFinanceManager(tx, input)
  const account = await tx.customerLedgerAccount.findFirst({
    where: { id: input.accountId, tenantId: input.tenantId },
    select: {
      id: true,
      customerId: true,
      currencyCode: true,
      lastSequence: true,
      revision: true,
    },
  })
  if (!account)
    throw new FinanceError(
      "NOT_FOUND",
      "Customer ledger account not found in this business.",
    )
  const snapshot = account.lastSequence
  const asOf = new Date()
  const [totals, debits, orders] = await Promise.all([
    getCustomerLedgerTotalsInTransaction(tx, account.id, snapshot),
    tx.$queryRaw<
      Array<{
        id: string
        kind: string
        effectiveAt: Date
        orderId: string | null
        remainingMinor: bigint
      }>
    >`
          SELECT * FROM (
            SELECT e.id, e.kind::text AS kind, e."effectiveAt", e."orderId",
              (e."amountMinor"
              - COALESCE((
                  SELECT SUM(a."amountMinor") FROM "CustomerLedgerAllocation" a
                  WHERE a."accountId" = e."accountId" AND a."chargeEntryId" = e.id
                    AND a.sequence <= ${snapshot}
                ), 0)
              + COALESCE((
                  SELECT SUM(r."amountMinor") FROM "CustomerLedgerAllocationRelease" r
                  JOIN "CustomerLedgerAllocation" a ON a.id = r."allocationId"
                  WHERE a."accountId" = e."accountId" AND a."chargeEntryId" = e.id
                    AND a.sequence <= ${snapshot} AND r.sequence <= ${snapshot}
                ), 0))::bigint AS "remainingMinor"
            FROM "CustomerLedgerEntry" e
            WHERE e."accountId" = ${account.id}
              AND e.side = 'DEBIT'
              AND e.sequence <= ${snapshot}
          ) owed
          WHERE owed."remainingMinor" > 0
          ORDER BY owed."effectiveAt" ASC, owed.id ASC
        `,
    tx.$queryRaw<
      Array<{
        id: string
        orderNumber: string
        storeId: string
        createdAt: Date
        balanceMinor: number
      }>
    >`
          SELECT o.id, o."orderNumber", o."storeId", o."createdAt",
            (o."totalMinor" - o."amountPaidMinor") AS "balanceMinor"
          FROM "CommercialOrder" o
          WHERE o."tenantId" = ${input.tenantId}
            AND o."customerId" = ${account.customerId}
            AND o."currencyCode" = ${account.currencyCode}
            AND o.status NOT IN ('DRAFT', 'PENDING', 'CANCELLED', 'REFUNDED')
            AND o."paymentStatus" <> 'REFUNDED'
            AND o."amountPaidMinor" < o."totalMinor"
            -- A legacy PAID Order without payment rows counts as fully paid.
            AND NOT (
              o."amountPaidMinor" = 0 AND o."paymentStatus" = 'PAID'
              AND NOT EXISTS (
                SELECT 1 FROM "CommercialOrderPayment" p WHERE p."orderId" = o.id
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM "CustomerLedgerEntry" charge
              WHERE charge."orderId" = o.id AND charge.kind = 'ORDER_CHARGE'
            )
          ORDER BY o."createdAt" ASC, o.id ASC
        `,
  ])
  const buckets = new Map<CustomerAgingBucketKey, Amounts>(
    CUSTOMER_AGING_BUCKETS.map((row) => [
      row.key,
      { statement: 0n, orders: 0n },
    ]),
  )
  let statementOwed = 0n
  for (const row of debits) {
    const amounts = buckets.get(customerAgingBucket(row.effectiveAt, asOf))
    // Raw sums can arrive as numeric; keep exact bigint arithmetic.
    const remaining = BigInt(row.remainingMinor)
    if (amounts) amounts.statement += remaining
    statementOwed += remaining
  }
  let ordersOwed = 0n
  for (const row of orders) {
    const amounts = buckets.get(customerAgingBucket(row.createdAt, asOf))
    if (amounts) amounts.orders += BigInt(row.balanceMinor)
    ordersOwed += BigInt(row.balanceMinor)
  }
  const oldest = [
    ...debits.map((row) => row.effectiveAt),
    ...orders.map((row) => row.createdAt),
  ].sort((a, b) => a.getTime() - b.getTime())[0]
  return {
    accountId: account.id,
    customerId: account.customerId,
    currencyCode: account.currencyCode,
    revision: account.revision.toString(),
    snapshotSequence: snapshot.toString(),
    asOf: asOf.toISOString(),
    buckets: CUSTOMER_AGING_BUCKETS.map((row) => {
      const amounts = buckets.get(row.key) ?? { statement: 0n, orders: 0n }
      return {
        key: row.key,
        fromDays: row.fromDays,
        toDays: row.toDays,
        statementMinor: amounts.statement.toString(),
        ordersMinor: amounts.orders.toString(),
        totalMinor: (amounts.statement + amounts.orders).toString(),
      }
    }),
    statementOwedMinor: statementOwed.toString(),
    ordersOwedMinor: ordersOwed.toString(),
    totalOwedMinor: (statementOwed + ordersOwed).toString(),
    availableCreditMinor: totals.availableCreditMinor,
    oldestOwedAt: oldest?.toISOString() ?? null,
    /** Per-entry remainders add up to the account's canonical owed amount. */
    reconciled: statementOwed.toString() === totals.outstandingDebtMinor,
    unpaidOrders: {
      count: orders.length,
      items: orders.slice(0, MAX_LISTED_ORDERS).map((row) => ({
        orderId: row.id,
        orderNumber: row.orderNumber,
        storeId: row.storeId,
        createdAt: row.createdAt.toISOString(),
        balanceMinor: String(row.balanceMinor),
        bucket: customerAgingBucket(row.createdAt, asOf),
      })),
    },
    coverage: "POSTED_ENTRIES_AND_LINKED_UNBILLED_ORDERS" as const,
  }
}
