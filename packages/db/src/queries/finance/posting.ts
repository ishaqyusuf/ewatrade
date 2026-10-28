import type {
  FinanceBook,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import {
  type CustomerBillingReclassificationSource,
  resolveCustomerBillingReclassification,
} from "../customer-ledger/billing-reclassification-source"
import { recordCommerceCustomerLedgerInTransaction } from "../customer-ledger/commerce-sources"
import {
  type CustomerFundsAllocationAuthority,
  readCustomerFundsAllocationAuthority,
} from "../customer-ledger/funds-allocation-authority"
import { getUnbilledOrderFundsControl } from "../customer-ledger/funds-order-control"
import { type FinanceActor, lockFinanceBook } from "./access"
import { financePostingCommandId } from "./commands"
import { resolveCommerceFinancePosting } from "./commerce-posting-source"
import { prepareInventoryCloseoutFinanceInTransaction } from "./inventory-closeout-posting-source"
import { resolveCommerceInventoryCostPosting } from "./inventory-cost-posting-source"
import { resolveInventoryCountPostings } from "./inventory-count-posting-source"
import { resolveCommerceInventoryReturnPosting } from "./inventory-return-posting-source"
import { resolveOrderCollectionPosting } from "./order-collection-source"
import {
  FinanceError,
  type FinanceLineInput,
  assertFinancePostingDate,
  financePayloadHash,
  validateFinanceLines,
} from "./rules"

export type FinancePostingInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  sourceKind: string
  sourceId: string
  description: string
  effectiveAt: Date
  storeId?: string
  reversalOfId?: string
  lines: FinanceLineInput[]
}

// Internal repository primitive. Public APIs must expose validated business
// commands, not an arbitrary-journal endpoint.
async function postJournalWithLockedBook(
  tx: Prisma.TransactionClient,
  input: FinancePostingInput,
  book: FinanceBook,
) {
  const lines = validateFinanceLines(input.lines)
  if (
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128 ||
    !input.sourceKind.trim() ||
    input.sourceKind.length > 64 ||
    !input.sourceId.trim() ||
    input.sourceId.length > 128 ||
    !input.description.trim() ||
    input.description.length > 500
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A journal requires a command, source and description.",
    )
  }
  const payloadHash = financePayloadHash({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    description: input.description.trim(),
    effectiveAt: input.effectiveAt,
    storeId: input.storeId ?? null,
    lines,
    ...(input.reversalOfId ? { reversalOfId: input.reversalOfId } : {}),
  })
  const command = await tx.financeCommand.findUnique({
    where: {
      bookId_clientCommandId: {
        bookId: book.id,
        clientCommandId: input.clientCommandId,
      },
    },
  })
  if (command) {
    if (
      command.kind !== "POST_JOURNAL" ||
      command.payloadHash !== payloadHash
    ) {
      throw new FinanceError(
        "CONFLICT",
        "This command was already used with different details.",
      )
    }
    return command.result
  }
  const existing = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
      },
    },
  })
  if (existing && existing.payloadHash !== payloadHash) {
    throw new FinanceError(
      "CONFLICT",
      "This source already has a different financial posting.",
    )
  }
  let entry = existing
  if (!entry) {
    if (
      input.reversalOfId &&
      !(await tx.financeJournalEntry.findFirst({
        where: {
          id: input.reversalOfId,
          bookId: book.id,
          reversalOfId: null,
          reversal: null,
        },
        select: { id: true },
      }))
    ) {
      throw new FinanceError(
        "CONFLICT",
        "The original posting is unavailable or already reversed.",
      )
    }
    assertFinancePostingDate({
      effectiveAt: input.effectiveAt,
      startsAt: book.startsAt,
      closedThrough: book.closedThrough,
      now: new Date(),
    })
    if (
      input.storeId &&
      !(await tx.store.findFirst({
        where: { id: input.storeId, tenantId: input.tenantId },
        select: { id: true },
      }))
    ) {
      throw new FinanceError("NOT_FOUND", "Store not found in this business.")
    }
    const accountIds = [...new Set(lines.map((line) => line.accountId))]
    const accounts = await tx.financeAccount.count({
      where: { bookId: book.id, id: { in: accountIds }, archivedAt: null },
    })
    if (accounts !== accountIds.length)
      throw new FinanceError(
        "NOT_FOUND",
        "An account is unavailable in this financial book.",
      )
    const updated = await tx.financeBook.update({
      where: { id: book.id },
      data: { lastSequence: { increment: 1 } },
    })
    entry = await tx.financeJournalEntry.create({
      data: {
        bookId: book.id,
        sequence: updated.lastSequence,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        payloadHash,
        description: input.description.trim(),
        actorUserId: input.actorUserId,
        effectiveAt: input.effectiveAt,
        storeId: input.storeId,
        reversalOfId: input.reversalOfId,
      },
    })
    const entryId = entry.id
    await tx.financeJournalLine.createMany({
      data: lines.map((line) => ({
        ...line,
        bookId: book.id,
        entryId,
      })),
    })
  }
  const result = { entryId: entry.id, sequence: entry.sequence.toString() }
  await tx.financeCommand.create({
    data: {
      bookId: book.id,
      clientCommandId: input.clientCommandId,
      kind: "POST_JOURNAL",
      payloadHash,
      actorUserId: input.actorUserId,
      result,
    },
  })
  return result
}

export async function postFinanceJournal(
  db: PrismaClient,
  input: FinancePostingInput,
) {
  return db.$transaction((tx) => postFinanceJournalInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}

export async function postFinanceJournalInTransaction(
  tx: Prisma.TransactionClient,
  input: FinancePostingInput,
) {
  return postJournalWithLockedBook(tx, input, await lockFinanceBook(tx, input))
}

/** Source adapter only: derives all journal authority from stored commerce facts.
 * Invoke within the authorized source transaction, never through a journal API.
 */
export async function postCommerceFinanceJournalInTransaction(
  tx: Prisma.TransactionClient,
  source: Parameters<typeof resolveCommerceFinancePosting>[1],
) {
  const resolved = await resolveCommerceFinancePosting(tx, source)
  if (!resolved) {
    // Free completed Product orders can consume carrying value without revenue.
    if (source.event === "EARNED") {
      await postEarnedInventoryCostInTransaction(tx, source)
    }
    return null
  }
  const posting = await postJournalWithLockedBook(
    tx,
    resolved.input,
    resolved.book,
  )
  await recordCommerceCustomerLedgerInTransaction(tx, source, resolved.book)
  if (source.event === "EARNED") {
    await postEarnedInventoryCostInTransaction(tx, source)
  }
  return posting
}

/** Called only by an authorized commerce payment command in its transaction. */
export async function postOrderCollectionInTransaction(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; orderId: string; paymentId: string },
  heldOrder?: Parameters<typeof resolveOrderCollectionPosting>[2],
) {
  const resolved = await resolveOrderCollectionPosting(tx, source, heldOrder)
  if (resolved.billed)
    return postCommerceFinanceJournalInTransaction(tx, {
      ...source,
      event: "PAYMENT",
    })
  return postJournalWithLockedBook(tx, resolved.input, resolved.book)
}

async function postEarnedInventoryCostInTransaction(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; orderId: string },
) {
  const cost = await resolveCommerceInventoryCostPosting(tx, source)
  if (!cost) return
  await postJournalWithLockedBook(tx, cost.input, cost.book)
  // Physical returns can precede explicit source posting. Keep the original
  // earned cost immutable and append each dated recovery from saved allocations.
  const returns = await tx.productReturn.findMany({
    where: {
      tenantId: source.tenantId,
      orderId: source.orderId,
      disposition: "RESTOCK",
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  for (const productReturn of returns) {
    await postProductReturnFinanceJournalInTransaction(tx, {
      tenantId: source.tenantId,
      productReturnId: productReturn.id,
    })
  }
}

/** Private supported-source composition; callers already hold Book/Order locks. */
export async function postProductReturnFinanceJournalInTransaction(
  tx: Prisma.TransactionClient,
  source: {
    tenantId: string
    productReturnId: string
    recordedValuation?: object
    journalReviewToken?: object
  },
) {
  const cost = await resolveCommerceInventoryReturnPosting(tx, source)
  if (!cost) return null
  return postJournalWithLockedBook(tx, cost.input, cost.book)
}

/** Private finalized Inventory source; caller already owns Book/Count/stock locks. */
export async function postStockCountFinanceJournalsInTransaction(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; stockCountId: string },
) {
  const count = await resolveInventoryCountPostings(tx, source)
  if (!count) return null
  for (const input of count.inputs) {
    await postJournalWithLockedBook(tx, input, count.book)
  }
}

/** Private fresh Inventory composer; caller owns Book/closeout/sorted stock locks. */
export async function recordInventoryCloseoutFinanceInTransaction(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; closeoutId: string; expectedBookId?: string },
) {
  const closeout = await prepareInventoryCloseoutFinanceInTransaction(
    tx,
    source,
  )
  if (!closeout) return null
  for (const input of closeout.inputs) {
    await postJournalWithLockedBook(tx, input, closeout.book)
  }
}

/** Customer-consented allocation adapter; derives the entire journal from its saved source.
 * The opaque capability belongs to this transaction and one Order. It cannot post
 * arbitrary lines, refund, collect cash, open accounts or act as a FinanceManager.
 */
export async function postCustomerCreditAllocationFinanceInTransaction(
  tx: Prisma.TransactionClient,
  source: { allocationId: string; clientCommandId: string },
  authority: CustomerFundsAllocationAuthority,
) {
  const allocation = await tx.customerLedgerAllocation.findUniqueOrThrow({
    where: { id: source.allocationId },
    include: { credit: true, charge: { include: { order: true } } },
  })
  const order = allocation.charge.order
  if (
    !order ||
    !(
      allocation.charge.kind === "ORDER_CHARGE" ||
      (allocation.charge.kind === "ORDER_PAYMENT" &&
        allocation.charge.side === "DEBIT" &&
        allocation.charge.sourceKind === "CUSTOMER_UNBILLED_ORDER_CREDIT" &&
        allocation.charge.sourceId === allocation.id &&
        allocation.charge.amountMinor === allocation.amountMinor)
    ) ||
    !["RECEIPT", "OPENING_CREDIT"].includes(allocation.credit.kind)
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Only an exact held-credit allocation to this Order can be posted.",
    )
  const held = readCustomerFundsAllocationAuthority(tx, authority, {
    tenantId: order.tenantId,
    actorUserId: allocation.actorUserId,
    accountId: allocation.accountId,
    bookId: (
      await tx.financeBook.findUniqueOrThrow({
        where: {
          tenantId_currencyCode: {
            tenantId: order.tenantId,
            currencyCode: order.currencyCode,
          },
        },
        select: { id: true },
      })
    ).id,
    orderId: order.id,
  })
  const [advance, receivable] = await Promise.all([
    tx.financeAccount.findFirst({
      where: {
        bookId: held.book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
    }),
    allocation.charge.sourceKind === "CUSTOMER_UNBILLED_ORDER_CREDIT"
      ? getUnbilledOrderFundsControl(tx, held.book.id)
      : tx.financeAccount.findFirst({
          where: {
            bookId: held.book.id,
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
  return postJournalWithLockedBook(
    tx,
    {
      tenantId: order.tenantId,
      actorUserId: allocation.actorUserId,
      bookId: held.book.id,
      clientCommandId: financePostingCommandId(
        `customer-ledger:${source.clientCommandId}`,
        "allocation",
      ),
      sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
      sourceId: allocation.id,
      description: `Apply existing customer credit to Order ${order.orderNumber}`,
      effectiveAt: allocation.createdAt,
      lines: [
        {
          accountId: advance.id,
          side: "DEBIT",
          amountMinor: allocation.amountMinor.toString(),
        },
        {
          accountId: receivable.id,
          side: "CREDIT",
          amountMinor: allocation.amountMinor.toString(),
        },
      ],
    },
    held.book,
  )
}

/** Internal exact-source reclassification at canonical billing; never a bank receipt. */
export async function postCustomerBillingReclassificationInTransaction(
  tx: Prisma.TransactionClient,
  source: CustomerBillingReclassificationSource,
) {
  const resolved = await resolveCustomerBillingReclassification(tx, source)
  return postJournalWithLockedBook(tx, resolved.input, resolved.book)
}
