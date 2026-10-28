import type { PrismaClient } from "../../generated/prisma/client"
import { getCustomerLedgerTotalsInTransaction } from "./customer-ledger/balances"
import { getCustomerFundsReservedInTransaction } from "./customer-ledger/funds-reservations"
import { assertFinanceManager } from "./finance/access"
import { FinanceError } from "./finance/rules"

/** Read only: Order determines Customer/currency; missing setup never creates a ledger. */
export function readOrderManualCustomerFunds(
  db: PrismaClient,
  input: { tenantId: string; actorUserId: string; orderId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const order = await tx.commercialOrder.findFirst({
        where: { id: input.orderId, tenantId: input.tenantId },
        select: { id: true, customerId: true, currencyCode: true },
      })
      if (!order) throw new FinanceError("NOT_FOUND", "Order not found.")
      if (!order.customerId) return null
      const account = await tx.customerLedgerAccount.findUnique({
        where: {
          tenantId_customerId_currencyCode: {
            tenantId: input.tenantId,
            customerId: order.customerId,
            currencyCode: order.currencyCode,
          },
        },
        select: { id: true, lastSequence: true, revision: true },
      })
      if (!account) return null
      const [totals, reserved] = await Promise.all([
        getCustomerLedgerTotalsInTransaction(
          tx,
          account.id,
          account.lastSequence,
        ),
        getCustomerFundsReservedInTransaction(tx, { accountId: account.id }),
      ])
      const available = BigInt(totals.availableCreditMinor) - reserved
      if (available < 0n || reserved < 0n)
        throw new FinanceError(
          "CONFLICT",
          "Customer funds need a current review.",
        )
      return {
        orderId: order.id,
        customerId: order.customerId,
        availableMinor: available.toString(),
        reservedMinor: reserved.toString(),
        currencyCode: order.currencyCode,
        accountId: account.id,
        accountRevision: account.revision.toString(),
        showCredit: available > 0n,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 },
  )
}
