import type { PrismaClient } from "../../../generated/prisma/client"
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
import { lockPostedCustomerOrderCharge } from "./order-charges"

/** Restores available credit and outstanding debt; never creates a cash refund. */
export async function releaseCustomerLedgerAllocation(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    clientCommandId: string
    expectedRevision: string
    allocationId: string
    amountMinor: string
    reason: string
  },
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
  return db.$transaction(
    async (tx) => {
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
      const allocation = await tx.customerLedgerAllocation.findFirst({
        where: { id: input.allocationId, accountId: account.id },
        include: { charge: true, credit: true },
      })
      if (!allocation)
        throw new FinanceError(
          "NOT_FOUND",
          "Allocation not found in this customer account.",
        )
      if (
        !["OPENING_DEBT", "ORDER_CHARGE"].includes(allocation.charge.kind) ||
        !["OPENING_CREDIT", "RECEIPT"].includes(allocation.credit.kind)
      )
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Only held-credit allocations can be released through this command.",
        )
      const order =
        allocation.charge.kind === "ORDER_CHARGE"
          ? await lockPostedCustomerOrderCharge(tx, {
              book,
              account,
              charge: allocation.charge,
            })
          : null
      const released = await tx.customerLedgerAllocationRelease.aggregate({
        where: { allocationId: allocation.id },
        _sum: { amountMinor: true },
      })
      if (
        amount >
        allocation.amountMinor - (released._sum.amountMinor ?? BigInt(0))
      )
        throw new FinanceError(
          "CONFLICT",
          "The release exceeds the remaining allocation.",
        )
      const [advance, receivable] = await Promise.all([
        tx.financeAccount.findFirst({
          where: {
            bookId: book.id,
            kind: "LIABILITY",
            purpose: "CUSTOMER_ADVANCE",
            archivedAt: null,
          },
        }),
        tx.financeAccount.findFirst({
          where: {
            bookId: book.id,
            kind: "ASSET",
            purpose: "RECEIVABLE",
            archivedAt: null,
          },
        }),
      ])
      if (!advance || !receivable)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer control accounts are unavailable.",
        )
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
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
