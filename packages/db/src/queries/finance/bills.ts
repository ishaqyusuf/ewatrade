import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError, MAX_FINANCE_AMOUNT, financeAmount } from "./rules"

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

function validateBillText(value: string, label: string, maximum = 500) {
  if (!value.trim() || value.length > maximum) {
    throw new FinanceError("INVALID_JOURNAL", `Enter a valid ${label}.`)
  }
}

export async function recordFinanceExpenseInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceExpenseInput,
) {
  validateBillText(input.payeeName, "payee", 160)
  validateBillText(input.description, "description")
  if (
    !Number.isFinite(input.incurredAt.getTime()) ||
    (input.reference && input.reference.length > 160) ||
    (input.dueAt &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.incurredAt))
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the bill dates and reference.",
    )
  }
  if (!input.lines.length || input.lines.length > 50) {
    throw new FinanceError("INVALID_JOURNAL", "An expense requires 1–50 lines.")
  }
  const lines = input.lines.map((line, position) => {
    validateBillText(line.description, "line description", 200)
    return {
      accountId: line.accountId,
      description: line.description.trim(),
      amountMinor: financeAmount(line.amountMinor),
      position,
    }
  })
  const totalMinor = lines.reduce(
    (total, line) => total + line.amountMinor,
    BigInt(0),
  )
  if (totalMinor > MAX_FINANCE_AMOUNT)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Bill total exceeds the transaction limit.",
    )
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
  const amount = financeAmount(input.amountMinor)
  const ownerFunded = input.funding === "OWNER_CAPITAL"
  if (
    (input.funding !== undefined &&
      !["OWNER_CAPITAL", "BUSINESS_ACCOUNT"].includes(input.funding)) ||
    (ownerFunded ? input.accountId !== undefined : !input.accountId)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a business payment account or owner capital funding.",
    )
  }
  if (
    !Number.isFinite(input.effectiveAt.getTime()) ||
    (input.reference && input.reference.length > 160)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the payment date and reference.",
    )
  }
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "PAY_BILL",
    payload,
    async (book) => {
      const bill = await tx.financeBill.findFirst({
        where: { id: input.billId, bookId: book.id },
      })
      if (!bill)
        throw new FinanceError("NOT_FOUND", "Bill not found in this business.")
      if (bill.kind !== "EXPENSE")
        throw new FinanceError(
          "CONFLICT",
          "Purchase bills require the purchase settlement command.",
        )
      if (bill.voidedAt)
        throw new FinanceError(
          "CONFLICT",
          "A cancelled bill cannot receive another payment.",
        )
      if (input.effectiveAt < bill.incurredAt)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A bill payment cannot precede the expense. Record advances separately.",
        )
      if (amount > bill.totalMinor - bill.paidMinor)
        throw new FinanceError(
          "CONFLICT",
          "Payment exceeds the bill's outstanding amount.",
        )
      const account = await tx.financeAccount.findFirst({
        where: {
          bookId: book.id,
          ...(ownerFunded
            ? {
                code: "3000",
                kind: "EQUITY" as const,
                purpose: "CAPITAL" as const,
              }
            : {
                id: input.accountId,
                purpose: {
                  in: ["CASH", "BANK", "CLEARING"] as Array<
                    "CASH" | "BANK" | "CLEARING"
                  >,
                },
              }),
          archivedAt: null,
        },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active payment account in this business.",
        )
      const payable = await tx.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "2000" } },
      })
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
