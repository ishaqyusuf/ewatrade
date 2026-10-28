import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { recordCommercialCreditSettlementInTransaction } from "../commercial-payments"
import { type FinanceActor, lockFinanceBook } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import { postCustomerCreditAllocationFinanceInTransaction } from "../finance/posting"
import { postFinanceJournalInTransaction } from "../finance/posting"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { lockCustomerLedgerAccount } from "./accounts"
import { reviewLockedCreditAllocationSource } from "./allocation-source-review"
import {
  type CustomerFundsAllocationAuthority,
  consumeCustomerFundsAllocationAuthority,
  readCustomerFundsAllocationAuthority,
} from "./funds-allocation-authority"

/** Apply held customer funds without recording another monetary collection. */
export type ApplyCustomerLedgerCreditInput = FinanceActor & {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  creditEntryId: string
  chargeEntryId: string
  amountMinor: string
}

export function applyCustomerLedgerCredit(
  db: PrismaClient,
  input: ApplyCustomerLedgerCreditInput,
) {
  return runInOwnTransaction(db, (tx) =>
    applyCustomerLedgerCreditInTransaction(tx, input),
  )
}

/** Caller owns the transaction; locks, current authority, replay and all effects remain canonical. */
export async function applyCustomerLedgerCreditInTransaction(
  tx: Prisma.TransactionClient,
  input: ApplyCustomerLedgerCreditInput,
  customerAuthority?: CustomerFundsAllocationAuthority,
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
  const authorized = customerAuthority
    ? readCustomerFundsAllocationAuthority(tx, customerAuthority, input)
    : null
  const book = authorized?.book ?? (await lockFinanceBook(tx, input))
  const account = authorized
    ? await tx.customerLedgerAccount.findUniqueOrThrow({
        where: { id: authorized.account.id },
      })
    : await lockCustomerLedgerAccount(tx, input)
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
  const { credit, charge, order, advance, receivable } =
    await reviewLockedCreditAllocationSource(tx, input, book, account, amount)
  if (customerAuthority) {
    if (!order)
      throw new FinanceError(
        "FORBIDDEN",
        "Customer consent can only settle its reviewed Order.",
      )
    readCustomerFundsAllocationAuthority(tx, customerAuthority, {
      ...input,
      orderId: order.id,
    })
    consumeCustomerFundsAllocationAuthority(
      tx,
      customerAuthority,
      { ...input, orderId: order.id },
      amount,
    )
  }
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
      createdAt: new Date(),
    },
    select: { id: true },
  })
  if (customerAuthority)
    await postCustomerCreditAllocationFinanceInTransaction(
      tx,
      { allocationId: allocation.id, clientCommandId: input.clientCommandId },
      customerAuthority,
    )
  else
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
      customerAuthority,
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
}
