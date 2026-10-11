import { runInOwnTransaction } from "../own-transaction"
import { reviewCustomerReceiptAccounts } from "./receipt-account-review"
import { randomUUID } from "node:crypto"
import type {
  CommercialPaymentMethod,
  Prisma,
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

export type RecordCustomerLedgerReceiptInput = FinanceActor & {
  bookId: string
  accountId: string
  moneyAccountId: string
  clientCommandId: string
  expectedRevision?: string
  amountMinor: string
  method: CommercialPaymentMethod
  reference?: string
  description: string
  storeId?: string
}

export function recordCustomerLedgerReceipt(
  db: PrismaClient,
  input: RecordCustomerLedgerReceiptInput,
) {
  return runInOwnTransaction(db, (tx) =>
    recordCustomerLedgerReceiptInTransaction(tx, input),
  )
}

/** Caller owns the transaction; canonical authority, replay and accounting checks remain. */
export async function recordCustomerLedgerReceiptInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordCustomerLedgerReceiptInput,
) {
  const amount = financeAmount(input.amountMinor)
  if (
    (input.expectedRevision !== undefined &&
      !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision)) ||
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
  if (
    input.expectedRevision !== undefined &&
    account.revision.toString() !== input.expectedRevision
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds changed. Review the receipt again.",
    )
  const { money, advances } = await reviewCustomerReceiptAccounts(
    tx,
    input,
    book,
  )
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
}
