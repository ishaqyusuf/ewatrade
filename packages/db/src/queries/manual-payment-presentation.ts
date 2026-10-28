import type { PrismaClient } from "../../generated/prisma/client"

/** Customer-safe provenance; receipt checks/reference matching never set confirmed. */
export function manualPaymentVerification(row: {
  status: string
  canonicalPaymentId: string | null
  customerReceiptId?: string | null
  decidedAt: Date | null
  receivedAt: Date | null
  receivedAmountMinor: number | null
}) {
  const confirmed =
    row.status === "CONFIRMED" &&
    Boolean(row.canonicalPaymentId || row.customerReceiptId)
  return {
    state: confirmed ? ("confirmed" as const) : ("unverified" as const),
    source: confirmed ? ("merchant_bank_check" as const) : null,
    confirmedAt: confirmed ? row.decidedAt : null,
    receivedAt: confirmed ? row.receivedAt : null,
    receivedAmountMinor: confirmed ? row.receivedAmountMinor : null,
    canonicalPaymentId: confirmed ? row.canonicalPaymentId : null,
  }
}

/** Only this report's confirmed receipt/allocation; never the customer's total credit. */
export async function manualPaymentConfirmedAllocation(
  db: Pick<
    PrismaClient,
    "commercialOrderPayment" | "customerFundsRefundRequest"
  >,
  row: {
    status: string
    canonicalPaymentId: string | null
    customerReceiptId: string | null
    customerCreditEntryId: string | null
    customerFundsRefundRequestId: string | null
    allocationPreference: string | null
    receivedAmountMinor: number | null
    tenantId: string
    orderId: string
  },
) {
  if (row.status !== "CONFIRMED" || row.receivedAmountMinor === null)
    return null
  const payment = row.canonicalPaymentId
    ? await db.commercialOrderPayment.findFirst({
        where: {
          id: row.canonicalPaymentId,
          tenantId: row.tenantId,
          orderId: row.orderId,
        },
        select: { amountMinor: true },
      })
    : null
  if (!payment && !row.customerReceiptId) return null
  const orderAmountMinor = payment?.amountMinor ?? 0
  if (orderAmountMinor > row.receivedAmountMinor) return null
  const excessAmountMinor = row.receivedAmountMinor - orderAmountMinor
  const refund =
    row.customerFundsRefundRequestId && row.customerCreditEntryId
      ? await db.customerFundsRefundRequest.findFirst({
          where: {
            id: row.customerFundsRefundRequestId,
            tenantId: row.tenantId,
            creditEntryId: row.customerCreditEntryId,
          },
          select: { status: true },
        })
      : null
  return {
    receivedAmountMinor: row.receivedAmountMinor,
    orderAmountMinor,
    excessAmountMinor,
    refundState: refund?.status ?? null,
    excessResolution:
      excessAmountMinor === 0
        ? null
        : refund
          ? ("refund_requested" as const)
          : row.allocationPreference === "REFUND"
            ? ("refund_details_needed" as const)
            : row.allocationPreference === "UNRESOLVED" ||
                row.allocationPreference === null
              ? ("business_review" as const)
              : ("held_credit" as const),
  }
}
