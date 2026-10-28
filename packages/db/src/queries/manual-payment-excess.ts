import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import {
  assertHeldCommerceFinancialOrder,
  type lockCommerceFinancialOrder,
} from "./customer-ledger/commerce-locks"
import { requestCustomerFundsRefundInTransaction } from "./customer-ledger/funds-refunds"
import { recordCustomerReceiptForOrderInTransaction } from "./customer-ledger/receipt-for-order"
import { assertFinanceManager } from "./finance/access"
import { rewrapManualRefundDestination } from "./manual-payment-allocation-proposal"
import { runInOwnTransaction } from "./own-transaction"

export type ManualPaymentAllocationReview = {
  orderAmountMinor: number
  expectedCustomerFundsAccountId: string
  expectedCustomerFundsRevision: string
  expectedOrderUpdatedAt: Date
  expectedOrderTotalMinor: number
  expectedOrderPaidMinor: number
}

type HeldOrder = NonNullable<
  Awaited<ReturnType<typeof lockCommerceFinancialOrder>>
>

/** Caller holds canonical Book/Customer/Order/Report + artifact/validated-transfer locks. */
export async function confirmManualPaymentExcessInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    actorUserId: string
    reportId: string
    linkId: string
    clientReportId: string
    bankCheckAttested: boolean
    receivedAmountMinor: number
    orderAmountMinor: number
    moneyAccountId: string
    receivedAt: Date
    reference?: string
    expectedCustomerFundsAccountId: string
    expectedOrderUpdatedAt: Date
    expectedCustomerFundsRevision: string
    expectedOrderTotalMinor: number
    expectedOrderPaidMinor: number
    currentOrderPaidMinor: number
    allocationPreference:
      | "ORDER_MORE"
      | "CREDIT"
      | "REFUND"
      | "UNRESOLVED"
      | null
    refundDestinationCiphertext: string | null
    destinationEncryptionKey?: string
  },
  held: HeldOrder,
) {
  assertHeldCommerceFinancialOrder(tx, held, {
    tenantId: input.tenantId,
    orderId: held.order.id,
  })
  if (input.bankCheckAttested !== true)
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Confirm the actual bank receipt before allocating excess funds.",
    )
  if (!held.context?.accountId || !held.order.customerId)
    throw new ManualPaymentError(
      "CONFLICT",
      "Set up this Order's customer funds before confirming the excess.",
    )
  if (
    ![
      input.receivedAmountMinor,
      input.orderAmountMinor,
      input.expectedOrderTotalMinor,
      input.expectedOrderPaidMinor,
      input.currentOrderPaidMinor,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    input.receivedAmountMinor <= 0 ||
    input.receivedAmountMinor > 100_000_000 ||
    input.expectedCustomerFundsAccountId !== held.context.accountId ||
    !Number.isFinite(input.expectedOrderUpdatedAt.getTime()) ||
    input.expectedOrderUpdatedAt.getTime() !== held.order.updatedAt.getTime() ||
    input.expectedOrderTotalMinor !== held.order.totalMinor ||
    input.expectedOrderPaidMinor !== input.currentOrderPaidMinor ||
    input.orderAmountMinor !==
      Math.min(
        input.receivedAmountMinor,
        Math.max(0, held.order.totalMinor - input.currentOrderPaidMinor),
      )
  )
    throw new ManualPaymentError(
      "CONFLICT",
      "The Order or received allocation changed. Review it again.",
    )
  // Canonical funds commands recheck current Finance Owner/Admin, dates and revisions.
  const result = await recordCustomerReceiptForOrderInTransaction(tx, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: held.context.bookId,
    accountId: held.context.accountId,
    orderId: held.order.id,
    storeId: held.order.storeId,
    expectedRevision: input.expectedCustomerFundsRevision,
    amountMinor: String(input.receivedAmountMinor),
    applyMinor: String(input.orderAmountMinor),
    moneyAccountId: input.moneyAccountId,
    method: "BANK_TRANSFER",
    clientCommandId: `manual-report:${input.reportId}`,
    reference: input.reference?.trim() || undefined,
    description: `Merchant-confirmed payment report ${input.reportId}`,
    effectiveAt: input.receivedAt,
  })
  let customerFundsRefundRequestId: string | null = null
  if (
    input.allocationPreference === "REFUND" &&
    result.excessMinor !== "0" &&
    result.creditEntryId &&
    input.refundDestinationCiphertext
  ) {
    if (!input.destinationEncryptionKey)
      throw new ManualPaymentError(
        "CONFLICT",
        "Refund details need a fresh business review before this receipt can be confirmed.",
      )
    const destination = rewrapManualRefundDestination({
      tenantId: input.tenantId,
      linkId: input.linkId,
      clientReportId: input.clientReportId,
      reportCiphertext: input.refundDestinationCiphertext,
      customerId: held.order.customerId,
      accountId: held.context.accountId,
      creditEntryId: result.creditEntryId,
      destinationEncryptionKey: input.destinationEncryptionKey,
    })
    const current = await tx.customerLedgerAccount.findUniqueOrThrow({
      where: { id: held.context.accountId },
      select: { revision: true },
    })
    const request = await requestCustomerFundsRefundInTransaction(tx, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      bookId: held.context.bookId,
      accountId: held.context.accountId,
      clientCommandId: `manual-report-refund:${input.reportId}`,
      expectedRevision: current.revision.toString(),
      creditEntryId: result.creditEntryId,
      amountMinor: result.excessMinor,
      ...destination,
      reason:
        "Customer requested a refund of this confirmed transfer's excess; destination requires finance review.",
    })
    customerFundsRefundRequestId = request.id
  }
  return {
    canonicalPaymentId: result.canonicalPaymentId,
    customerReceiptId: result.receiptId,
    customerCreditEntryId: result.creditEntryId,
    customerFundsRefundRequestId,
    orderAllocationMinor: Number(result.appliedMinor),
    excessAmountMinor: Number(result.excessMinor),
  }
}

export function readManualPaymentFundsReview(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; reportId: string },
) {
  return runInOwnTransaction(db, async (tx) => {
    await assertFinanceManager(tx, input)
    const report = await tx.manualPaymentReport.findFirst({
      where: { id: input.reportId, link: { tenantId: input.tenantId } },
      include: {
        link: {
          include: {
            order: { include: { _count: { select: { payments: true } } } },
          },
        },
      },
    })
    if (!report?.link.order.customerId) return null
    const order = report.link.order
    const account = await tx.customerLedgerAccount.findUnique({
      where: {
        tenantId_customerId_currencyCode: {
          tenantId: input.tenantId,
          customerId: order.customerId ?? "",
          currencyCode: order.currencyCode,
        },
      },
      select: { id: true, revision: true },
    })
    if (!account) return null
    return {
      expectedCustomerFundsAccountId: account.id,
      expectedCustomerFundsRevision: account.revision.toString(),
      expectedOrderUpdatedAt: order.updatedAt,
      expectedOrderTotalMinor: order.totalMinor,
      expectedOrderPaidMinor: effectiveCommercialAmountPaid({
        ...order,
        paymentCount: order._count.payments,
      }),
    }
  })
}
