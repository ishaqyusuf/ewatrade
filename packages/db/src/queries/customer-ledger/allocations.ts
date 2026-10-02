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

/** Apply held customer funds without recording another monetary collection. */
export async function applyCustomerLedgerCredit(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId: string
    clientCommandId: string
    expectedRevision: string
    creditEntryId: string
    chargeEntryId: string
    amountMinor: string
  },
) {
  const amount = financeAmount(input.amountMinor)
  if (
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A reviewed revision and stable command identity are required.",
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
          previous.kind !== "ALLOCATE" ||
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
            "Previous allocation result cannot be recovered.",
          )
        return { id: result.id }
      }
      if (account.revision !== BigInt(input.expectedRevision))
        throw new FinanceError(
          "CONFLICT",
          "The customer account changed. Review current balances before applying credit.",
        )
      const [credit, charge] = await Promise.all([
        tx.customerLedgerEntry.findFirst({
          where: {
            id: input.creditEntryId,
            accountId: account.id,
            side: "CREDIT",
            kind: { in: ["OPENING_CREDIT", "RECEIPT"] },
            reversals: { none: {} },
          },
        }),
        tx.customerLedgerEntry.findFirst({
          where: {
            id: input.chargeEntryId,
            accountId: account.id,
            side: "DEBIT",
            kind: { in: ["OPENING_DEBT", "ORDER_CHARGE"] },
            reversals: { none: {} },
          },
        }),
      ])
      if (!credit || !charge)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Choose available held credit and a posted debt in this customer account.",
        )
      const order =
        charge.kind === "ORDER_CHARGE"
          ? await lockPostedCustomerOrderCharge(tx, { book, account, charge })
          : null
      if (
        order &&
        ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(order.status)
      )
        throw new FinanceError(
          "CONFLICT",
          "Credit can only settle an active confirmed Order.",
        )
      const used = async (
        side: "creditEntryId" | "chargeEntryId",
        id: string,
      ) => {
        const [allocated, released] = await Promise.all([
          tx.customerLedgerAllocation.aggregate({
            where: { accountId: account.id, [side]: id },
            _sum: { amountMinor: true },
          }),
          tx.customerLedgerAllocationRelease.aggregate({
            where: { allocation: { accountId: account.id, [side]: id } },
            _sum: { amountMinor: true },
          }),
        ])
        return (
          (allocated._sum.amountMinor ?? BigInt(0)) -
          (released._sum.amountMinor ?? BigInt(0))
        )
      }
      const [creditUsed, chargePaid] = await Promise.all([
        used("creditEntryId", credit.id),
        used("chargeEntryId", charge.id),
      ])
      if (
        creditUsed < BigInt(0) ||
        chargePaid < BigInt(0) ||
        amount > credit.amountMinor - creditUsed ||
        amount > charge.amountMinor - chargePaid
      )
        throw new FinanceError(
          "CONFLICT",
          "The allocation exceeds available credit or remaining debt.",
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
      const allocation = await tx.customerLedgerAllocation.create({
        data: {
          accountId: account.id,
          sequence: updated.lastSequence,
          creditEntryId: credit.id,
          chargeEntryId: charge.id,
          amountMinor: amount,
          actorUserId: input.actorUserId,
        },
        select: { id: true },
      })
      await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          `customer-ledger:${input.clientCommandId}`,
          "allocation",
        ),
        sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
        sourceId: allocation.id,
        description: order
          ? `Apply existing customer credit to Order ${order.orderNumber}`
          : "Apply existing customer credit to opening debt",
        effectiveAt: new Date(),
        lines: [
          {
            accountId: advance.id,
            side: "DEBIT",
            amountMinor: amount.toString(),
          },
          {
            accountId: receivable.id,
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
            clientPaymentId: `customer-allocation:${allocation.id}`,
            method: "other",
          },
          { bookId: book.id, allocationId: allocation.id },
        )
      await tx.customerLedgerCommand.create({
        data: {
          tenantId: input.tenantId,
          accountId: account.id,
          clientCommandId: input.clientCommandId,
          kind: "ALLOCATE",
          payloadHash: hash,
          actorUserId: input.actorUserId,
          result: allocation,
        },
      })
      return allocation
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
