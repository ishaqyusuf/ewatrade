import { reviewHeldCreditRefundSource } from "./refund-source-review"
import { runInOwnTransaction } from "../own-transaction"
import { randomUUID } from "node:crypto"
import type {
  CommercialPaymentMethod,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import type { FinanceActor } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import { FinanceError, financeAmount } from "../finance/rules"
import { customerLedgerDocumentCommand } from "./commands"

export type RefundCustomerLedgerCreditInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  creditEntryId: string
  amountMinor: string
  moneyAccountId: string
  method: CommercialPaymentMethod
  reference?: string
  reason: string
  effectiveAt: Date
}

/** Return only unused held funds; applying credit to a charge must be released first. */
export function refundCustomerLedgerCredit(
  db: PrismaClient,
  input: RefundCustomerLedgerCreditInput,
) {
  return runInOwnTransaction(db, (tx) =>
    refundCustomerLedgerCreditInTransaction(tx, input),
  )
}

/** Caller owns the transaction; source authority and accounting checks remain canonical. */
export async function refundCustomerLedgerCreditInTransaction(
  tx: Prisma.TransactionClient,
  input: RefundCustomerLedgerCreditInput,
) {
  const amount = financeAmount(input.amountMinor)
  const reason = input.reason.trim()
  const reference = input.reference?.trim() || null
  if (
    !reason ||
    reason.length > 400 ||
    (reference?.length ?? 0) > 160 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"].includes(input.method) ||
    !Number.isFinite(input.effectiveAt.getTime())
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the customer balance and supply a valid refund method, date and reason.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return customerLedgerDocumentCommand(
    tx,
    input,
    "REFUND_HELD_CREDIT",
    { ...payload, reason, reference },
    async (book, account) => {
      if (account.revision !== BigInt(input.expectedRevision))
        throw new FinanceError(
          "CONFLICT",
          "The customer account changed. Review available funds before returning money.",
        )
      const { credit, money, advance } = await reviewHeldCreditRefundSource(tx, input, book, account)
      const updated = await tx.customerLedgerAccount.update({
        where: { id: account.id },
        data: {
          revision: { increment: 1 },
          lastSequence: { increment: 1 },
        },
      })
      const refundId = randomUUID()
      const entry = await tx.customerLedgerEntry.create({
        data: {
          id: refundId,
          tenantId: input.tenantId,
          accountId: account.id,
          sequence: updated.lastSequence,
          kind: "REFUND",
          side: "DEBIT",
          amountMinor: amount,
          sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
          sourceId: refundId,
          actorUserId: input.actorUserId,
          effectiveAt: input.effectiveAt,
          description: `Customer funds returned: ${reason}`,
        },
        select: { id: true },
      })
      await tx.customerLedgerAllocation.create({
        data: {
          accountId: account.id,
          sequence: updated.lastSequence,
          creditEntryId: credit.id,
          chargeEntryId: entry.id,
          amountMinor: amount,
          actorUserId: input.actorUserId,
        },
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          `customer-ledger:${input.clientCommandId}`,
          "held-credit-refund",
        ),
        sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
        sourceId: entry.id,
        description: `Return held customer funds: ${reason}`,
        effectiveAt: input.effectiveAt,
        lines: [
          {
            accountId: advance.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: money.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      return {
        id: entry.id,
        audit: {
          creditEntryId: credit.id,
          moneyAccountId: money.id,
          method: input.method,
          reference,
          reason,
          effectiveAt: input.effectiveAt.toISOString(),
          amountMinor: amount.toString(),
        },
      }
    },
  )
}
