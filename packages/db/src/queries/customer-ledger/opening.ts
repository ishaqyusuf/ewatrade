import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"

export async function recordCustomerLedgerOpening(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    clientCommandId: string
    direction: "DEBT" | "CREDIT"
    amountMinor: string
    reason: string
  },
) {
  const amount = financeAmount(input.amountMinor)
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128 ||
    !["DEBT", "CREDIT"].includes(input.direction)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Opening balances require a direction, reason and stable command identity.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const hash = financePayloadHash(payload)
  return db.$transaction(
    async (tx) => {
      const book = await lockFinanceBook(tx, input)
      const account = await lockCustomerLedgerAccount(tx, input)
      if (account.currencyCode !== book.currencyCode)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The customer account and financial book must use the same currency.",
        )
      const previous = await tx.customerLedgerCommand.findUnique({
        where: {
          tenantId_clientCommandId: {
            tenantId: input.tenantId,
            clientCommandId: input.clientCommandId,
          },
        },
      })
      if (previous) {
        if (
          previous.accountId !== account.id ||
          previous.kind !== "OPENING" ||
          previous.payloadHash !== hash
        )
          throw new FinanceError(
            "CONFLICT",
            "This customer command has already been used with different details.",
          )
        const result = previous.result
        if (
          !result ||
          typeof result !== "object" ||
          Array.isArray(result) ||
          typeof result.id !== "string"
        )
          throw new FinanceError(
            "CONFLICT",
            "The previous opening result cannot be recovered.",
          )
        return { id: result.id }
      }
      const sourceId = `${account.id}:${input.direction}`
      if (
        await tx.customerLedgerEntry.findUnique({
          where: {
            tenantId_sourceKind_sourceId: {
              tenantId: input.tenantId,
              sourceKind: "CUSTOMER_OPENING",
              sourceId,
            },
          },
        })
      )
        throw new FinanceError(
          "CONFLICT",
          "This opening direction has already been imported. Correct the existing entry instead of importing it again.",
        )
      const linkedHistory = await tx.commercialOrder.findFirst({
        where: {
          tenantId: input.tenantId,
          customerId: account.customerId,
          currencyCode: account.currencyCode,
          createdAt: { lte: book.startsAt },
          status: { not: "CANCELLED" },
        },
        select: { id: true },
      })
      if (linkedHistory)
        throw new FinanceError(
          "CONFLICT",
          "Linked orders exist before this cutoff. Reconcile their opening treatment before importing a customer balance.",
        )
      const debt = input.direction === "DEBT"
      const [control, equity] = await Promise.all([
        tx.financeAccount.findFirst({
          where: {
            bookId: book.id,
            purpose: debt ? "RECEIVABLE" : "CUSTOMER_ADVANCE",
            kind: debt ? "ASSET" : "LIABILITY",
            archivedAt: null,
          },
        }),
        tx.financeAccount.findFirst({
          where: {
            bookId: book.id,
            purpose: "OPENING_EQUITY",
            kind: "EQUITY",
            archivedAt: null,
          },
        }),
      ])
      if (!control || !equity)
        throw new FinanceError(
          "NOT_FOUND",
          "Required opening accounts are unavailable.",
        )
      const updated = await tx.customerLedgerAccount.update({
        where: { id: account.id },
        data: { lastSequence: { increment: 1 }, revision: { increment: 1 } },
      })
      const entry = await tx.customerLedgerEntry.create({
        data: {
          tenantId: input.tenantId,
          accountId: account.id,
          sequence: updated.lastSequence,
          kind: debt ? "OPENING_DEBT" : "OPENING_CREDIT",
          side: debt ? "DEBIT" : "CREDIT",
          amountMinor: amount,
          sourceKind: "CUSTOMER_OPENING",
          sourceId,
          actorUserId: input.actorUserId,
          effectiveAt: book.startsAt,
          description: reason,
        },
        select: { id: true },
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          `customer-ledger:${input.clientCommandId}`,
          "opening",
        ),
        sourceKind: "CUSTOMER_LEDGER_OPENING",
        sourceId: entry.id,
        description: `Customer opening ${input.direction.toLowerCase()}: ${reason}`,
        effectiveAt: book.startsAt,
        lines: [
          {
            accountId: control.id,
            side: debt ? "DEBIT" : "CREDIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: equity.id,
            side: debt ? "CREDIT" : "DEBIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      await tx.customerLedgerCommand.create({
        data: {
          tenantId: input.tenantId,
          accountId: account.id,
          clientCommandId: input.clientCommandId,
          kind: "OPENING",
          payloadHash: hash,
          actorUserId: input.actorUserId,
          result: entry,
        },
      })
      return entry
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
