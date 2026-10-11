import { runInOwnTransaction } from "../own-transaction"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { recordCommercialCreditSettlementInTransaction } from "../commercial-payments"
import { type FinanceActor, lockFinanceBook } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postFinanceJournalInTransaction } from "../finance/posting"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"
import { reviewLockedAllocationReleaseSource } from "./allocation-release-review-source"

/** Restores available credit and outstanding debt; never creates a cash refund. */
export type ReleaseCustomerLedgerAllocationInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  allocationId: string
  amountMinor: string
  reason: string
}

export function releaseCustomerLedgerAllocation(
  db: PrismaClient,
  input: ReleaseCustomerLedgerAllocationInput,
) {
  return runInOwnTransaction(db, (tx) =>
    releaseCustomerLedgerAllocationInTransaction(tx, input),
  )
}

/** Caller owns the transaction; locks, current authority, replay and all effects remain canonical. */
export async function releaseCustomerLedgerAllocationInTransaction(
  tx: Prisma.TransactionClient,
  input: ReleaseCustomerLedgerAllocationInput,
) {
  const amount = financeAmount(input.amountMinor)
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 1000 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A reason, reviewed revision and stable command identity are required.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const hash = financePayloadHash(payload)
  const book = await lockFinanceBook(tx, input)
  const account = await lockCustomerLedgerAccount(tx, input)
  if (account.currencyCode !== book.currencyCode)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Customer and financial book currency must match.",
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
      previous.kind !== "RELEASE_ALLOCATION" ||
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
        "Previous release result cannot be recovered.",
      )
    return { id: result.id }
  }
  if (account.revision !== BigInt(input.expectedRevision))
    throw new FinanceError(
      "CONFLICT",
      "The customer account changed. Review current balances before releasing credit.",
    )
  const { allocation, order, advance, receivable } =
    await reviewLockedAllocationReleaseSource(tx, input, book, account, amount)
  const updated = await tx.customerLedgerAccount.update({
    where: { id: account.id },
    data: { lastSequence: { increment: 1 }, revision: { increment: 1 } },
  })
  const release = await tx.customerLedgerAllocationRelease.create({
    data: {
      allocationId: allocation.id,
      sequence: updated.lastSequence,
      amountMinor: amount,
      reason,
      actorUserId: input.actorUserId,
    },
    select: { id: true },
  })
  await postFinanceJournalInTransaction(tx, {
    ...input,
    clientCommandId: financePostingCommandId(
      `customer-ledger:${input.clientCommandId}`,
      "release",
    ),
    sourceKind: "CUSTOMER_ALLOCATION_RELEASE",
    sourceId: release.id,
    effectiveAt: new Date(),
    description: `Release customer credit allocation: ${reason}`,
    lines: [
      {
        accountId: receivable.id,
        side: "DEBIT",
        amountMinor: amount.toString(),
      },
      {
        accountId: advance.id,
        side: "CREDIT",
        amountMinor: amount.toString(),
      },
    ],
  })
  if (order)
    await recordCommercialCreditSettlementInTransaction(
      tx,
      {
        ...input,
        orderId: order.id,
        amountMinor: Number(amount),
        clientPaymentId: `customer-allocation-release:${release.id}`,
        method: "other",
        type: "refund",
        note: reason,
      },
      { bookId: book.id, releaseId: release.id },
    )
  await tx.customerLedgerCommand.create({
    data: {
      tenantId: input.tenantId,
      accountId: account.id,
      clientCommandId: input.clientCommandId,
      kind: "RELEASE_ALLOCATION",
      payloadHash: hash,
      actorUserId: input.actorUserId,
      result: release,
    },
  })
  return release
}
