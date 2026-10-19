import { createFinanceBookInTransaction } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type { GeneralTransactionContext } from "./general-actions"

/** A reviewed new Book cannot silently become an existing Book while confirming. */
export async function createReviewedNewBook(
  ctx: GeneralTransactionContext,
  actor: { tenantId: string; actorUserId: string },
  startsAt: Date,
) {
  await ctx.db
    .$queryRaw`SELECT id FROM "Tenant" WHERE id = ${actor.tenantId} FOR UPDATE`
  const existing = await ctx.db.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: actor.tenantId,
        currencyCode: ctx.tenantContext.tenant.currencyCode,
      },
    },
    select: { id: true },
  })
  if (existing)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The Finance Book now exists. Review the account again.",
    })
  return createFinanceBookInTransaction(ctx.db, { ...actor, startsAt })
}

/** Only defaults created in this same new-Book transaction may satisfy its reviewed account. */
export async function isReviewedNewBookDefault(
  ctx: GeneralTransactionContext,
  input: {
    bookId: string
    accountId: string
    purpose: "CASH" | "BANK"
  },
) {
  return Boolean(
    await ctx.db.financeAccount.findFirst({
      where: {
        id: input.accountId,
        bookId: input.bookId,
        code: input.purpose === "CASH" ? "1000" : "1100",
        name: input.purpose === "CASH" ? "Shop cash" : "Bank account",
        kind: "ASSET",
        purpose: input.purpose,
        archivedAt: null,
      },
      select: { id: true },
    }),
  )
}
