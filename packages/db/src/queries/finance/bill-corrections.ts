import { type Correction, correctionReason, readBillCorrectionPosting, readBillPaymentCorrectionSource, readExpenseVoidSource } from "./bill-correction-source"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"

async function reverseBillSource(
  tx: Prisma.TransactionClient,
  input: Correction,
  source: {
    kind: "EXPENSE_BILL" | "BILL_PAYMENT" | "OWNER_BILL_PAYMENT"
    id: string
  },
  reason: string,
) {
  const original = await readBillCorrectionPosting(tx, input, source)
  await postFinanceJournalInTransaction(tx, {
    ...input,
    clientCommandId: financePostingCommandId(
      input.clientCommandId,
      "bill-correction",
    ),
    sourceKind: `${source.kind}_REVERSAL`,
    sourceId: original.id,
    reversalOfId: original.id,
    description: `Reversal: ${reason}`,
    storeId: original.storeId ?? undefined,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      side: line.debitMinor > BigInt(0) ? "CREDIT" : "DEBIT",
      amountMinor: (line.debitMinor > BigInt(0)
        ? line.debitMinor
        : line.creditMinor
      ).toString(),
      description: line.description ?? undefined,
    })),
  })
}

export async function reverseFinanceBillPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: Correction & { paymentId: string },
) {
  const reason = correctionReason(input)
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_BILL_PAYMENT",
    { paymentId: input.paymentId, effectiveAt: input.effectiveAt, reason },
    async () => {
      const payment = await readBillPaymentCorrectionSource(tx, input)
      await reverseBillSource(
        tx,
        input,
        {
          kind:
            payment.account.purpose === "CAPITAL"
              ? "OWNER_BILL_PAYMENT"
              : "BILL_PAYMENT",
          id: payment.id,
        },
        reason,
      )
      await tx.financeBillPayment.update({
        where: { id: payment.id },
        data: {
          reversedAt: new Date(),
          reversalEffectiveAt: input.effectiveAt,
          reversedById: input.actorUserId,
          reversalReason: reason,
        },
      })
      await tx.financeBill.update({
        where: { id: payment.billId },
        data: { paidMinor: { decrement: payment.amountMinor } },
      })
      return { id: payment.id }
    },
  )
}

export async function voidFinanceExpenseInTransaction(
  tx: Prisma.TransactionClient,
  input: Correction & { billId: string },
) {
  const reason = correctionReason(input)
  return financeDocumentCommand(
    tx,
    input,
    "VOID_EXPENSE",
    { billId: input.billId, effectiveAt: input.effectiveAt, reason },
    async () => {
      const bill = await readExpenseVoidSource(tx, input)
      await reverseBillSource(
        tx,
        input,
        { kind: "EXPENSE_BILL", id: bill.id },
        reason,
      )
      await tx.financeBill.update({
        where: { id: bill.id },
        data: {
          voidedAt: new Date(),
          voidEffectiveAt: input.effectiveAt,
          voidedById: input.actorUserId,
          voidReason: reason,
        },
      })
      return { id: bill.id }
    },
  )
}

export async function reverseFinanceBillPayment(
  db: PrismaClient,
  input: Correction & { paymentId: string },
) {
  return db.$transaction(
    (tx) => reverseFinanceBillPaymentInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function voidFinanceExpense(
  db: PrismaClient,
  input: Correction & { billId: string },
) {
  return db.$transaction((tx) => voidFinanceExpenseInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}
