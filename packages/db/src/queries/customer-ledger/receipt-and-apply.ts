import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { FinanceError, financeAmount } from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { applyCustomerLedgerCreditInTransaction } from "./allocations"
import { customerLedgerDocumentCommand } from "./commands"
import {
  type RecordCustomerLedgerReceiptInput,
  recordCustomerLedgerReceiptInTransaction,
} from "./receipts"

/** At most this many unpaid charges are settled by one payment. */
const MAX_CHARGES = 50

export type RecordCustomerLedgerReceiptAndApplyInput =
  RecordCustomerLedgerReceiptInput

export function recordCustomerLedgerReceiptAndApply(
  db: PrismaClient,
  input: RecordCustomerLedgerReceiptAndApplyInput,
) {
  return runInOwnTransaction(db, (tx) =>
    recordCustomerLedgerReceiptAndApplyInTransaction(tx, input),
  )
}

/**
 * Records a customer payment and uses it on the oldest unpaid charges (opening
 * debt and Orders), in one transaction under one command identity. What is
 * left over stays as paid-ahead money. Each step is the canonical receipt and
 * credit-allocation command, with derived command identities.
 */
export async function recordCustomerLedgerReceiptAndApplyInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordCustomerLedgerReceiptAndApplyInput,
) {
  const amount = financeAmount(input.amountMinor)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return customerLedgerDocumentCommand(
    tx,
    input,
    "RECEIPT_AND_APPLY",
    payload,
    async (_book, account) => {
      const receipt = await recordCustomerLedgerReceiptInTransaction(tx, {
        ...input,
        clientCommandId: `${input.clientCommandId}:receipt`,
      })
      const saved = await tx.customerLedgerReceipt.findUnique({
        where: { id: receipt.id },
        select: { entryId: true },
      })
      if (!saved)
        throw new FinanceError(
          "CONFLICT",
          "The recorded payment could not be found.",
        )
      const charges = await tx.customerLedgerEntry.findMany({
        where: {
          accountId: account.id,
          side: "DEBIT",
          kind: { in: ["OPENING_DEBT", "ORDER_CHARGE"] },
          reversals: { none: {} },
        },
        orderBy: { sequence: "asc" },
        select: { id: true, amountMinor: true },
        take: 500,
      })
      let left = amount
      let applied = BigInt(0)
      const allocations: string[] = []
      for (const charge of charges) {
        if (left <= BigInt(0) || allocations.length >= MAX_CHARGES) break
        const [allocated, released] = await Promise.all([
          tx.customerLedgerAllocation.aggregate({
            where: { accountId: account.id, chargeEntryId: charge.id },
            _sum: { amountMinor: true },
          }),
          tx.customerLedgerAllocationRelease.aggregate({
            where: {
              allocation: { accountId: account.id, chargeEntryId: charge.id },
            },
            _sum: { amountMinor: true },
          }),
        ])
        const remaining =
          charge.amountMinor -
          ((allocated._sum.amountMinor ?? BigInt(0)) -
            (released._sum.amountMinor ?? BigInt(0)))
        if (remaining <= BigInt(0)) continue
        const use = remaining < left ? remaining : left
        const current = await tx.customerLedgerAccount.findUniqueOrThrow({
          where: { id: account.id },
          select: { revision: true },
        })
        try {
          const allocation = await applyCustomerLedgerCreditInTransaction(tx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            bookId: input.bookId,
            accountId: input.accountId,
            clientCommandId: `${input.clientCommandId}:apply:${allocations.length}`,
            expectedRevision: current.revision.toString(),
            creditEntryId: saved.entryId,
            chargeEntryId: charge.id,
            amountMinor: use.toString(),
          })
          allocations.push(allocation.id)
          left -= use
          applied += use
        } catch (error) {
          // An Order that can't take credit (draft, cancelled, refunded) is
          // skipped before anything is written; anything else stops the command.
          if (
            error instanceof FinanceError &&
            error.message ===
              "Credit can only settle an active confirmed Order."
          )
            continue
          throw error
        }
      }
      return {
        id: receipt.id,
        audit: {
          receiptId: receipt.id,
          appliedMinor: applied.toString(),
          paidAheadMinor: left.toString(),
          allocations,
        },
      }
    },
  )
}
