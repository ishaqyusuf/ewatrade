import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import type { OrderScope } from "../order-visibility"
import { type BusinessReport, type ReportPeriod, reportPeriod } from "./types"

const paymentMethodLabels: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  CUSTOMER_CREDIT: "Customer credit",
  OTHER: "Other",
}

export type PaymentGroup = {
  method: string
  type: string
  amountMinor: string
  count: bigint
}
export function paymentCollectionsFromGroups(
  groups: PaymentGroup[],
  input: OrderScope & ReportPeriod & { storeName?: string },
): BusinessReport {
  let received = 0n
  let refunded = 0n
  let credit = 0n
  for (const row of groups) {
    const signed =
      row.type === "REFUND" ? -BigInt(row.amountMinor) : BigInt(row.amountMinor)
    if (row.method === "CUSTOMER_CREDIT") credit += signed
    else if (row.type === "REFUND") refunded += BigInt(row.amountMinor)
    else received += BigInt(row.amountMinor)
  }
  return {
    report: "payment_collections",
    asOf: new Date().toISOString(),
    complete: true,
    scope: `${input.storeName ?? "Selected Store"} · ${input.createdByUserId ? "Your orders" : "All permitted orders"}`,
    dateBasis: "Payment recordedAt; start inclusive, end exclusive",
    currencyCode: input.currencyCode,
    period: reportPeriod(input),
    totals: {
      kind: "payment_collections",
      receivedMinor: received.toString(),
      refundedMinor: refunded.toString(),
      netMoneyMinor: (received - refunded).toString(),
      netCustomerCreditMinor: credit.toString(),
    },
    summary: `Received ${received}; refunded ${refunded}; net money ${received - refunded} ${input.currencyCode} minor units. Net customer-credit settlement ${credit}, separately.`,
    rows: groups.map((row) => ({
      id: `${row.method}_${row.type}`,
      label: `${paymentMethodLabels[row.method] ?? row.method} · ${row.type === "REFUND" ? "Refund" : "Payment"}`,
      moneyMinor: row.amountMinor,
      value: `${row.amountMinor} ${input.currencyCode} minor units`,
      detail: `${row.count} immutable payment rows. ${row.method === "CUSTOMER_CREDIT" ? "Ledger settlement; not money received/refunded." : "Recorded money; provider/bank settlement is not verified."}`,
    })),
    gaps: [
      "Commercial Order payment/refund rows only. Unallocated customer ledger receipts, supplier payments, expenses, opening balances and transfers excluded.",
      "Legacy orders marked paid without payment rows have unknown collection dates and are excluded. Order status does not erase recorded payments/refunds.",
      "OTHER may be money of unknown method. This is not a physical cash count, cash account balance, revenue or profit.",
    ],
  }
}
export async function getBusinessPaymentCollectionsInTransaction(
  tx: Prisma.TransactionClient,
  input: OrderScope & ReportPeriod & { storeName?: string },
) {
  reportPeriod(input)
  if (!input.storeId) throw new Error("Choose a Store for payment collections.")
  const rows = await tx.$queryRaw<PaymentGroup[]>(Prisma.sql`
    SELECT p.method::text AS method, p.type::text AS type, SUM(p."amountMinor")::text AS "amountMinor", COUNT(*) AS count
    FROM "CommercialOrderPayment" p JOIN "CommercialOrder" o ON o.id = p."orderId" AND o."tenantId" = p."tenantId" AND o."storeId" = p."storeId"
    WHERE p."tenantId" = ${input.tenantId} AND p."storeId" = ${input.storeId} AND o."currencyCode" = ${input.currencyCode}
      AND p."recordedAt" >= ${input.from} AND p."recordedAt" < ${input.before}
      ${input.createdByUserId ? Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
    GROUP BY p.method, p.type ORDER BY p.method, p.type
  `)
  return paymentCollectionsFromGroups(rows, input)
}
export function getBusinessPaymentCollections(
  db: PrismaClient,
  input: Parameters<typeof getBusinessPaymentCollectionsInTransaction>[1],
) {
  return db.$transaction(
    (tx) => getBusinessPaymentCollectionsInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
