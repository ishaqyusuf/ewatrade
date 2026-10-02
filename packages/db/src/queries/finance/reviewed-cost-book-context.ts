import type { Prisma } from "../../../generated/prisma/client"
import { type FinanceActor, lockFinanceBook } from "./access"
import { FinanceError } from "./rules"

type Scope = FinanceActor & { bookId: string }
type Book = Awaited<ReturnType<typeof lockFinanceBook>>

/** Private read-only composition capability; never reused by financial writers. */
export class ReviewedCostBookContext {
  private constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly scope: Scope,
    private readonly book: Book,
  ) {}

  static async acquire(tx: Prisma.TransactionClient, input: Scope) {
    const book = await lockFinanceBook(tx, input)
    if (book.id !== input.bookId || book.tenantId !== input.tenantId)
      throw new FinanceError(
        "CONFLICT",
        "Held reviewed-cost Book scope differs.",
      )
    return new ReviewedCostBookContext(tx, { ...input }, book)
  }

  read(tx: Prisma.TransactionClient, input: Scope): Readonly<Book> {
    if (
      tx !== this.tx ||
      input.tenantId !== this.scope.tenantId ||
      input.actorUserId !== this.scope.actorUserId ||
      input.bookId !== this.scope.bookId
    )
      throw new FinanceError(
        "CONFLICT",
        "Reviewed-cost Book context cannot cross transaction, actor or Book scope.",
      )
    return this.book
  }
}

export async function readReviewedCostBook(
  tx: Prisma.TransactionClient,
  input: Scope,
  context?: ReviewedCostBookContext,
) {
  return context ? context.read(tx, input) : lockFinanceBook(tx, input)
}
