import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import {
  type ReviewedShortagePostingCandidate,
  bindReviewedShortagePostings,
} from "./reviewed-cost-shortage-postings"
import { FinanceError } from "./rules"

/** References locate entries; audited immutable source records supply ordered inputs. */
export async function readReviewedShortagePostingInputsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
  context: ReviewedCostBookContext,
  prior: PriorCostReviewSnapshot,
  candidatesInput: ReviewedShortagePostingCandidate[],
) {
  const book = context.read(tx, input)
  if (
    candidatesInput.length > 4096 ||
    prior.journals.length > 4096 ||
    prior.evidence.length > 4096 ||
    [...prior.journals, ...prior.evidence].some(
      (row) => row.tenantId !== book.tenantId || row.bookId !== book.id,
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "Original shortage references cross held scope or exceed complete bounds.",
    )
  const candidates = structuredClone(candidatesInput)
  const ids = [
    ...new Set([
      ...prior.journals.map((j) => j.journalEntryId),
      ...prior.evidence.flatMap((e) =>
        e.sourceJournalEntryId === null ? [] : [e.sourceJournalEntryId],
      ),
    ]),
  ]
  if (
    candidates.length > 4096 ||
    ids.length > 4096 ||
    candidates.some(
      (c) => c.tenantId !== book.tenantId || c.bookId !== book.id,
    ) ||
    ids.some((id) => !id.trim())
  )
    throw new FinanceError(
      "CONFLICT",
      "Original shortage reference scope exceeds bounds or crosses held Book.",
    )
  if (!candidates.length || !ids.length) return []
  const entries = await tx.financeJournalEntry.findMany({
    where: {
      id: { in: ids },
      bookId: book.id,
      book: { tenantId: book.tenantId },
      sourceKind: {
        in: ["INVENTORY_COUNT_SHORTAGE", "INVENTORY_CLOSEOUT_SHORTAGE"],
      },
      sourceId: { in: candidates.map((c) => c.movementId) },
      reversalOfId: null,
    },
    select: {
      id: true,
      bookId: true,
      sourceKind: true,
      sourceId: true,
      reversalOfId: true,
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (!entries.length) return []
  // Archived historical controls remain valid; current availability is not history.
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, code: { in: ["6000", "1300"] } },
    select: { id: true, bookId: true, code: true, kind: true, purpose: true },
    orderBy: { id: "asc" },
    take: 3,
  })
  if (
    accounts.length > 2 ||
    entries.length > 4096 ||
    entries.some((e) => !ids.includes(e.id))
  )
    throw new FinanceError(
      "CONFLICT",
      "Original shortage journal/control-account scope is incomplete.",
    )
  return bindReviewedShortagePostings({
    scope: { tenantId: book.tenantId, bookId: book.id },
    candidates,
    entries,
    accounts,
  })
}
