import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { recordCommercialCreditSettlementInTransaction } from "../commercial-payments"
import { lockFinanceBook } from "../finance/access"
import { financePostingCommandId } from "../finance/commands"
import {
  postCustomerCreditAllocationFinanceInTransaction,
  postFinanceJournalInTransaction,
} from "../finance/posting"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"
import type { ApplyCustomerLedgerCreditInput } from "./allocations"
import { lockCommerceFinancialOrder } from "./commerce-locks"
import {
  type CustomerFundsAllocationAuthority,
  consumeCustomerFundsAllocationAuthority,
  readCustomerFundsAllocationAuthority,
} from "./funds-allocation-authority"
import { getUnbilledOrderFundsControl } from "./funds-order-control"
import { assertCustomerFundsNotReserved } from "./funds-reservations"
import { assertExactHeldCreditSource } from "./reversal-sources"

export type ApplyUnbilledCustomerCreditInput = Omit<
  ApplyCustomerLedgerCreditInput,
  "chargeEntryId"
> & { orderId: string }
/** Transfer custody from general held credit to one unbilled Order; never create billing or cash. */
export async function applyUnbilledCustomerCreditInTransaction(
  tx: Prisma.TransactionClient,
  input: ApplyUnbilledCustomerCreditInput,
  authority?: CustomerFundsAllocationAuthority,
) {
  const amount = financeAmount(input.amountMinor)
  if (
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the customer funds and command identity.",
    )
  const authorized = authority
    ? readCustomerFundsAllocationAuthority(tx, authority, input)
    : null
  const book = authorized?.book ?? (await lockFinanceBook(tx, input))
  const account = authorized
    ? await tx.customerLedgerAccount.findUniqueOrThrow({
        where: { id: authorized.account.id },
      })
    : await lockCustomerLedgerAccount(tx, input)
  const { tenantId: _tenant, actorUserId: _actor, ...payload } = input
  const hash = financePayloadHash(payload)
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
      previous.kind !== "ALLOCATE_UNBILLED" ||
      previous.accountId !== account.id ||
      previous.payloadHash !== hash ||
      !previous.result ||
      typeof previous.result !== "object" ||
      Array.isArray(previous.result) ||
      typeof previous.result.id !== "string"
    )
      throw new FinanceError(
        "CONFLICT",
        "This credit command was used with different details.",
      )
    return { id: previous.result.id }
  }
  if (
    account.currencyCode !== book.currencyCode ||
    account.revision.toString() !== input.expectedRevision
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds changed. Review the credit amount again.",
    )
  const locked = await lockCommerceFinancialOrder(tx, {
    tenantId: input.tenantId,
    orderId: input.orderId,
    expectedIdentity: {
      currencyCode: account.currencyCode,
      customerId: account.customerId,
    },
  })
  if (
    !locked ||
    locked.context?.bookId !== book.id ||
    locked.context.accountId !== account.id ||
    ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(
      locked.order.status,
    ) ||
    amount > BigInt(locked.order.totalMinor - locked.order.amountPaidMinor)
  )
    throw new FinanceError(
      "CONFLICT",
      "The current Order cannot accept this credit amount.",
    )
  const billing = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: "COMMERCIAL_ORDER_BILLED",
        sourceId: input.orderId,
      },
    },
  })
  if (billing)
    throw new FinanceError(
      "CONFLICT",
      "This Order is billed. Use its posted customer charge.",
    )
  const [credit, advance, control] = await Promise.all([
    tx.customerLedgerEntry.findFirst({
      where: {
        id: input.creditEntryId,
        accountId: account.id,
        side: "CREDIT",
        kind: { in: ["RECEIPT", "OPENING_CREDIT"] },
        reversals: { none: {} },
      },
    }),
    tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
    }),
    getUnbilledOrderFundsControl(tx, book.id),
  ])
  if (
    !credit ||
    !advance ||
    !(await assertExactHeldCreditSource(tx, input, credit, advance.id))
  )
    throw new FinanceError(
      "CONFLICT",
      "Reconcile the held-credit source before using it.",
    )
  const [allocated, released] = await Promise.all([
    tx.customerLedgerAllocation.aggregate({
      where: { accountId: account.id, creditEntryId: credit.id },
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerAllocationRelease.aggregate({
      where: {
        allocation: { accountId: account.id, creditEntryId: credit.id },
      },
      _sum: { amountMinor: true },
    }),
  ])
  const used =
    (allocated._sum.amountMinor ?? 0n) - (released._sum.amountMinor ?? 0n)
  if (used < 0n || used > credit.amountMinor)
    throw new FinanceError(
      "CONFLICT",
      "Reconcile the held-credit allocations first.",
    )
  await assertCustomerFundsNotReserved(
    tx,
    { accountId: account.id, creditEntryId: credit.id },
    credit.amountMinor - used,
    amount,
  )
  if (authority)
    consumeCustomerFundsAllocationAuthority(tx, authority, input, amount)
  const updated = await tx.customerLedgerAccount.update({
    where: { id: account.id },
    data: { revision: { increment: 1 }, lastSequence: { increment: 1 } },
  })
  const allocationId = randomUUID()
  const now = new Date()
  const commitment = await tx.customerLedgerEntry.create({
    data: {
      tenantId: input.tenantId,
      accountId: account.id,
      sequence: updated.lastSequence,
      kind: "ORDER_PAYMENT",
      side: "DEBIT",
      amountMinor: amount,
      sourceKind: "CUSTOMER_UNBILLED_ORDER_CREDIT",
      sourceId: allocationId,
      orderId: locked.order.id,
      storeId: locked.order.storeId,
      actorUserId: input.actorUserId,
      effectiveAt: now,
      description: `Use held funds on unbilled Order ${locked.order.orderNumber}`,
    },
  })
  await tx.customerLedgerAllocation.create({
    data: {
      id: allocationId,
      accountId: account.id,
      sequence: updated.lastSequence,
      creditEntryId: credit.id,
      chargeEntryId: commitment.id,
      amountMinor: amount,
      actorUserId: input.actorUserId,
      createdAt: now,
    },
  })
  if (authority)
    await postCustomerCreditAllocationFinanceInTransaction(
      tx,
      { allocationId, clientCommandId: input.clientCommandId },
      authority,
    )
  else
    await postFinanceJournalInTransaction(tx, {
      ...input,
      clientCommandId: financePostingCommandId(
        `customer-ledger:${input.clientCommandId}`,
        "allocation",
      ),
      sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
      sourceId: allocationId,
      description: `Apply existing customer credit to Order ${locked.order.orderNumber}`,
      effectiveAt: now,
      lines: [
        {
          accountId: advance.id,
          side: "DEBIT",
          amountMinor: amount.toString(),
        },
        {
          accountId: control.id,
          side: "CREDIT",
          amountMinor: amount.toString(),
        },
      ],
    })
  await recordCommercialCreditSettlementInTransaction(
    tx,
    {
      ...input,
      amountMinor: Number(amount),
      clientPaymentId: `customer-allocation:${allocationId}`,
      method: "other",
    },
    { bookId: book.id, allocationId },
    authority,
  )
  const result = { id: allocationId }
  await tx.customerLedgerCommand.create({
    data: {
      tenantId: input.tenantId,
      accountId: account.id,
      clientCommandId: input.clientCommandId,
      kind: "ALLOCATE_UNBILLED",
      payloadHash: hash,
      actorUserId: input.actorUserId,
      result,
    },
  })
  return result
}
