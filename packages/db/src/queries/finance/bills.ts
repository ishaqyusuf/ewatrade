import { normalizeFinanceBillPayment, reviewFinanceBillPaymentSource } from "./bill-payment-source"
import { normalizeFinanceExpense } from "./expense-input"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError } from "./rules"

export type FinanceBillPaymentDetails = {
  amountMinor: string
  effectiveAt: Date
  reference?: string
} & (
  | { funding?: "BUSINESS_ACCOUNT"; accountId: string }
  | { funding: "OWNER_CAPITAL"; accountId?: never }
)

export type FinanceExpenseInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  payeeName: string
  reference?: string
  description: string
  incurredAt: Date
  dueAt?: Date
  storeId?: string
  lines: Array<{ accountId: string; description: string; amountMinor: string }>
  payment?: FinanceBillPaymentDetails
}

export async function recordFinanceExpenseInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceExpenseInput,
) {
  const { lines, totalMinor } = normalizeFinanceExpense(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECORD_EXPENSE",
    payload,
    async (book) => {
      const ids = [...new Set(lines.map((line) => line.accountId))]
      const count = await tx.financeAccount.count({
        where: {
          bookId: book.id,
          id: { in: ids },
          kind: "EXPENSE",
          purpose: "OPERATING_EXPENSE",
          archivedAt: null,
        },
      })
      if (count !== ids.length)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose active expense categories in this business.",
        )
      const payable = await tx.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "2000" } },
      })
      const bill = await tx.financeBill.create({
        data: {
          bookId: book.id,
          kind: "EXPENSE",
          payeeName: input.payeeName.trim(),
          description: input.description.trim(),
          reference: input.reference?.trim() || null,
          incurredAt: input.incurredAt,
          dueAt: input.dueAt,
          storeId: input.storeId,
          totalMinor,
          actorUserId: input.actorUserId,
        },
      })
      await tx.financeBillLine.createMany({
        data: lines.map((line) => ({
          ...line,
          bookId: book.id,
          billId: bill.id,
        })),
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "expense",
        ),
        sourceKind: "EXPENSE_BILL",
        sourceId: bill.id,
        effectiveAt: input.incurredAt,
        lines: [
          ...lines.map((line) => ({
            accountId: line.accountId,
            side: "DEBIT" as const,
            amountMinor: line.amountMinor.toString(),
            description: line.description,
          })),
          {
            accountId: payable.id,
            side: "CREDIT",
            amountMinor: totalMinor.toString(),
          },
        ],
      })
      if (input.payment) {
        await payFinanceBillInTransaction(tx, {
          ...input.payment,
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: book.id,
          billId: bill.id,
          clientCommandId: financePostingCommandId(
            input.clientCommandId,
            "initial-payment",
          ),
        })
      }
      return { id: bill.id }
    },
  )
}

export type FinanceBillPaymentInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  billId: string
} & FinanceBillPaymentDetails

export async function payFinanceBillInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceBillPaymentInput,
) {
  const { amount, ownerFunded } = normalizeFinanceBillPayment(input)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "PAY_BILL",
    payload,
    async (book) => {
      const { bill, account, payable } = await reviewFinanceBillPaymentSource(tx, input, book)
      const payment = await tx.financeBillPayment.create({
        data: {
          bookId: book.id,
          billId: bill.id,
          accountId: account.id,
          amountMinor: amount,
          effectiveAt: input.effectiveAt,
          reference: input.reference?.trim() || null,
          actorUserId: input.actorUserId,
        },
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "bill-payment",
        ),
        sourceKind: ownerFunded ? "OWNER_BILL_PAYMENT" : "BILL_PAYMENT",
        sourceId: payment.id,
        storeId: bill.storeId ?? undefined,
        description:
          `${ownerFunded ? "Owner-funded payment" : "Payment"}: ${bill.description}`.slice(
            0,
            500,
          ),
        lines: [
          {
            accountId: payable.id,
            side: "DEBIT",
            amountMinor: input.amountMinor,
          },
          {
            accountId: account.id,
            side: "CREDIT",
            amountMinor: input.amountMinor,
          },
        ],
      })
      await tx.financeBill.update({
        where: { id: bill.id },
        data: { paidMinor: { increment: amount } },
      })
      return { id: payment.id }
    },
  )
}

export async function recordFinanceExpense(
  db: PrismaClient,
  input: FinanceExpenseInput,
) {
  return db.$transaction((tx) => recordFinanceExpenseInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}

export async function payFinanceBill(
  db: PrismaClient,
  input: FinanceBillPaymentInput,
) {
  return db.$transaction((tx) => payFinanceBillInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}
