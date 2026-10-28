import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  type RefundCommercialOrderInput,
  refundCommercialOrderInTransaction,
} from "../commercial-order-credits"
import { financePostingCommandId } from "../finance/commands"
import { FinanceError, financeAmount } from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { releaseCustomerLedgerAllocationInTransaction } from "./allocation-releases"
import { customerAllocationBillingOrigin } from "./billing-reclassification"
import { customerLedgerDocumentCommand } from "./commands"
import type { CustomerFundsRefundCommand } from "./funds-refunds"

export type ReturnCustomerOrderFundsInput = CustomerFundsRefundCommand & {
  orderId: string
  storeId: string
  reason: string
  /** Exact original allocations restored to credit; never paid out as cash here. */
  creditReturns: Array<{ allocationId: string; amountMinor: string }>
  /** Money already sent; ordinary cash refund remains canonical Commerce work. */
  cashReturn?: Pick<
    RefundCommercialOrderInput,
    "amountMinor" | "method" | "reference" | "moneyAccountId"
  >
}

export function returnCustomerOrderFunds(
  db: PrismaClient,
  input: ReturnCustomerOrderFundsInput,
) {
  return runInOwnTransaction(db, (tx) =>
    returnCustomerOrderFundsInTransaction(tx, input),
  )
}
/** Source-aware mixed return. Merchandise/price credits use their own canonical workflow. */
export async function returnCustomerOrderFundsInTransaction(
  tx: Prisma.TransactionClient,
  input: ReturnCustomerOrderFundsInput,
) {
  if (
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !input.reason.trim() ||
    input.reason.trim().length > 400 ||
    input.creditReturns.length > 50 ||
    (!input.creditReturns.length && !input.cashReturn) ||
    new Set(input.creditReturns.map((row) => row.allocationId)).size !==
      input.creditReturns.length
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the original payment sources and return amounts.",
    )
  for (const row of input.creditReturns) financeAmount(row.amountMinor)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return customerLedgerDocumentCommand(
    tx,
    input,
    "ORDER_FUNDS_RETURN",
    payload,
    async (_book, account) => {
      if (account.revision.toString() !== input.expectedRevision)
        throw new FinanceError(
          "CONFLICT",
          "Customer funds changed. Review the original payment sources again.",
        )
      const order = await tx.commercialOrder.findFirst({
        where: {
          id: input.orderId,
          tenantId: input.tenantId,
          storeId: input.storeId,
          customerId: account.customerId,
          currencyCode: account.currencyCode,
        },
        select: { id: true },
      })
      if (!order)
        throw new FinanceError(
          "CONFLICT",
          "This Order does not belong to the reviewed customer account and Store.",
        )
      const releases: string[] = []
      for (const [index, selected] of input.creditReturns.entries()) {
        const originalId = await customerAllocationBillingOrigin(tx, {
          tenantId: input.tenantId,
          accountId: account.id,
          allocationId: selected.allocationId,
        })
        const allocation = await tx.customerLedgerAllocation.findFirst({
          where: {
            id: originalId ?? selected.allocationId,
            accountId: account.id,
            charge: { orderId: input.orderId, tenantId: input.tenantId },
            orderSettlement: { orderId: input.orderId },
          },
          select: {
            id: true,
            charge: { select: { order: { select: { storeId: true } } } },
          },
        })
        if (!allocation || allocation.charge.order?.storeId !== input.storeId)
          throw new FinanceError(
            "CONFLICT",
            "The selected credit source does not belong to this Order and Store.",
          )
        const current = await tx.customerLedgerAccount.findUniqueOrThrow({
          where: { id: account.id },
          select: { revision: true },
        })
        const release = await releaseCustomerLedgerAllocationInTransaction(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: input.bookId,
          accountId: input.accountId,
          clientCommandId: financePostingCommandId(
            input.clientCommandId,
            `credit-return-${index}`,
          ),
          expectedRevision: current.revision.toString(),
          allocationId: selected.allocationId,
          amountMinor: selected.amountMinor,
          reason: input.reason,
        })
        releases.push(release.id)
      }
      let paymentId: string | null = null
      if (input.cashReturn) {
        const refund = await refundCommercialOrderInTransaction(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          orderId: input.orderId,
          storeId: input.storeId,
          clientOperationId: financePostingCommandId(
            input.clientCommandId,
            "cash-return",
          ),
          ...input.cashReturn,
          reason: input.reason,
          lowerTotal: false,
        })
        paymentId = refund.paymentId
      }
      const resultId = paymentId ?? releases[0]
      if (!resultId)
        throw new FinanceError(
          "CONFLICT",
          "The source return result could not be recovered.",
        )
      return {
        id: resultId,
        audit: {
          orderId: input.orderId,
          creditReleaseIds: releases,
          cashRefundPaymentId: paymentId,
          sourcePolicy: "RESTORE_CREDIT_AND_RETURN_ONLY_CASH_COLLECTIONS",
        },
      }
    },
  )
}
