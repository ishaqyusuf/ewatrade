import type { PrismaClient } from "../../../generated/prisma/client"
import { createCustomerInTransaction } from "../customers"
import {
  type FinanceActor,
  assertFinanceManager,
  lockFinanceBook,
} from "../finance/access"
import { FinanceError } from "../finance/rules"
import { ensureCustomerLedgerAccountInTransaction } from "./accounts"
import { recordCustomerLedgerOpeningInTransaction } from "./opening"

export type CreateCustomerWithOpeningInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  customer: { name: string; phone?: string; email?: string }
  opening: { direction: "DEBT" | "CREDIT"; amountMinor: string; reason: string }
}

/**
 * Add customer with a starting balance, all or nothing: a failed opening
 * (closed period, missing account, bad amount) leaves no half-saved customer.
 * The opening itself is the canonical command, at the book's start date.
 */
export async function createCustomerWithOpening(
  db: PrismaClient,
  input: CreateCustomerWithOpeningInput,
) {
  if (
    !input.customer.name.trim() ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A customer name and a stable command identity are required.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const previous = await tx.customerLedgerCommand.findUnique({
        where: {
          tenantId_clientCommandId: {
            tenantId: input.tenantId,
            clientCommandId: input.clientCommandId,
          },
        },
        include: {
          account: {
            select: {
              id: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
      })
      if (previous) {
        const result = previous.result
        if (
          previous.kind !== "OPENING" ||
          previous.account.customer.name !== input.customer.name.trim() ||
          !result ||
          typeof result !== "object" ||
          Array.isArray(result) ||
          typeof result.id !== "string"
        )
          throw new FinanceError(
            "CONFLICT",
            "This customer command has already been used with different details.",
          )
        // The opening replay below re-checks direction, amount and reason.
        const entry = await recordCustomerLedgerOpeningInTransaction(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: input.bookId,
          accountId: previous.account.id,
          clientCommandId: input.clientCommandId,
          ...input.opening,
        })
        return {
          customerId: previous.account.customer.id,
          accountId: previous.account.id,
          entryId: entry.id,
          replayed: true as const,
        }
      }
      const book = await lockFinanceBook(tx, input)
      const customer = await createCustomerInTransaction(tx, {
        tenantId: input.tenantId,
        ...input.customer,
      })
      const account = await ensureCustomerLedgerAccountInTransaction(tx, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        customerId: customer.id,
        currencyCode: book.currencyCode,
      })
      const entry = await recordCustomerLedgerOpeningInTransaction(tx, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        bookId: book.id,
        accountId: account.id,
        clientCommandId: input.clientCommandId,
        ...input.opening,
      })
      return {
        customerId: customer.id,
        accountId: account.id,
        entryId: entry.id,
        replayed: false as const,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
