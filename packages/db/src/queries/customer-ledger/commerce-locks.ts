import type {
  CommercialOrder,
  FinanceBook,
  Prisma,
} from "../../../generated/prisma/client"
import { CatalogError } from "../catalog"

// Lock evidence is valid only for the transaction and scope that acquired it.
const heldOrderLocks = new WeakMap<
  object,
  { tx: Prisma.TransactionClient; tenantId: string; orderId: string }
>()

export function assertHeldCommerceFinancialOrder(
  tx: Prisma.TransactionClient,
  lock: object,
  input: { tenantId: string; orderId: string },
) {
  const held = heldOrderLocks.get(lock)
  if (
    !held ||
    held.tx !== tx ||
    held.tenantId !== input.tenantId ||
    held.orderId !== input.orderId
  )
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order lock does not belong to this transaction and scope.",
    )
}

const heldBooks = new WeakMap<object, FinanceBook>()

/**
 * The Book row a held Order lock locked, read once per lock. Its lastSequence
 * can lag journals posted since; posting takes sequences from its own increment.
 */
export async function readHeldCommerceFinanceBook(
  tx: Prisma.TransactionClient,
  lock: { context: { bookId: string } | null },
  input: { tenantId: string; orderId: string },
) {
  assertHeldCommerceFinancialOrder(tx, lock, input)
  if (!lock.context) return null
  const cached = heldBooks.get(lock)
  if (cached) return cached
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: lock.context.bookId },
  })
  heldBooks.set(lock, book)
  return book
}

/** Coordination only; callers retain the existing commerce authorization boundary. */
export async function lockCommerceFinancialContext(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; currencyCode: string; customerId?: string | null },
) {
  const books = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "FinanceBook"
    WHERE "tenantId" = ${input.tenantId} AND "currencyCode" = ${input.currencyCode}
    FOR UPDATE
  `
  const book = books[0]
  if (!book) return null
  const accounts = input.customerId
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "CustomerLedgerAccount"
        WHERE "tenantId" = ${input.tenantId}
          AND "customerId" = ${input.customerId}
          AND "currencyCode" = ${input.currencyCode}
        FOR UPDATE
      `
    : []
  return { bookId: book.id, accountId: accounts[0]?.id ?? null }
}

/** Acquire before fulfillment/job/source locks; authorization stays with Commerce. */
export async function lockCommerceFinancialOrder(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    orderId: string
    expectedIdentity?: { currencyCode: string; customerId: string | null }
  },
) {
  const identity = await tx.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: { customerId: true, currencyCode: true },
  })
  if (!identity) return null
  // A multi-Order caller already acquired its planned financial contexts.
  // Never introduce another book/account after a prior Order has been locked.
  if (
    input.expectedIdentity &&
    (identity.currencyCode !== input.expectedIdentity.currencyCode ||
      identity.customerId !== input.expectedIdentity.customerId)
  )
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order financial ownership changed. Reload the batch before retrying.",
    )
  const context = await lockCommerceFinancialContext(tx, {
    ...input,
    ...identity,
  })
  const [order] = await tx.$queryRaw<CommercialOrder[]>`
    SELECT * FROM "CommercialOrder"
    WHERE id = ${input.orderId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `
  if (!order) return null
  // Do not acquire a different book/account after holding the Order lock.
  if (
    order.currencyCode !== identity.currencyCode ||
    order.customerId !== identity.customerId
  ) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order financial ownership changed. Reload the Order before retrying.",
    )
  }
  const locked = { context, order }
  heldOrderLocks.set(locked, {
    tx,
    tenantId: input.tenantId,
    orderId: input.orderId,
  })
  return locked
}
