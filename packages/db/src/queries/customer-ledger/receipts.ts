import { randomUUID } from "node:crypto"
import type {
  CommercialPaymentMethod,
  PrismaClient,
} from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"

export async function recordCustomerLedgerReceipt(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    moneyAccountId: string
    clientCommandId: string
    amountMinor: string
    method: CommercialPaymentMethod
    reference?: string
    description: string
    storeId?: string
  },
) {
  const amount = financeAmount(input.amountMinor)
  if (
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128 ||
    !input.description.trim() ||
    input.description.length > 400 ||
    (input.reference?.length ?? 0) > 160 ||
    !["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"].includes(input.method)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A receipt requires valid method, description, reference and command identity.",
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
          "Receipt currency must match the customer account and financial book.",
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
          previous.kind !== "RECEIPT" ||
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
            "The previous receipt result cannot be recovered.",
          )
        return { id: result.id }
      }
      const money = await tx.financeAccount.findFirst({
        where: {
          id: input.moneyAccountId,
          bookId: book.id,
          kind: "ASSET",
          purpose: { in: ["CASH", "BANK", "CLEARING"] },
          archivedAt: null,
        },
      })
      if (!money)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active money account in this financial book.",
        )
      if (
        (input.method === "CASH" && money.purpose !== "CASH") ||
        (input.method === "BANK_TRANSFER" && money.purpose !== "BANK") ||
        (["CARD", "POS"].includes(input.method) && money.purpose === "CASH")
      )
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The selected money account does not match the receipt method.",
        )
      const advances = await tx.financeAccount.findFirst({
        where: {
          bookId: book.id,
          purpose: "CUSTOMER_ADVANCE",
          kind: "LIABILITY",
          archivedAt: null,
        },
      })
      if (!advances)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer advance account is unavailable.",
        )
      if (
        input.storeId &&
        !(await tx.store.findFirst({
          where: { id: input.storeId, tenantId: input.tenantId },
          select: { id: true },
        }))
      )
        throw new FinanceError("NOT_FOUND", "Store not found in this business.")
      const now = new Date()
      const receiptId = randomUUID()
      const updated = await tx.customerLedgerAccount.update({
        where: { id: account.id },
        data: { lastSequence: { increment: 1 }, revision: { increment: 1 } },
      })
      const entry = await tx.customerLedgerEntry.create({
        data: {
          tenantId: input.tenantId,
          accountId: account.id,
          sequence: updated.lastSequence,
          kind: "RECEIPT",
          side: "CREDIT",
          amountMinor: amount,
          sourceKind: "CUSTOMER_RECEIPT",
          sourceId: receiptId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          effectiveAt: now,
          description: input.description.trim(),
        },
      })
      const receipt = await tx.customerLedgerReceipt.create({
        data: {
          id: receiptId,
          accountId: account.id,
          entryId: entry.id,
          bookId: book.id,
          moneyAccountId: money.id,
          method: input.method,
          reference: input.reference?.trim() || null,
        },
        select: { id: true },
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          `customer-ledger:${input.clientCommandId}`,
          "receipt",
        ),
        sourceKind: "CUSTOMER_RECEIPT",
        sourceId: receipt.id,
        description: input.description.trim(),
        effectiveAt: now,
        lines: [
          {
            accountId: money.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: advances.id,
            side: "CREDIT",
            amountMinor: amount.toString(),
          },
        ],
      })
      await tx.customerLedgerCommand.create({
        data: {
          tenantId: input.tenantId,
          accountId: account.id,
          clientCommandId: input.clientCommandId,
          kind: "RECEIPT",
          payloadHash: hash,
          actorUserId: input.actorUserId,
          result: receipt,
        },
      })
      return receipt
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
