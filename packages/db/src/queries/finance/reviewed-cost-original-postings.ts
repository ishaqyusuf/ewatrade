import type { PriorCostReviewExpectedPosting } from "./reviewed-cost-prior-journal-proof"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { FinanceError, financePayloadHash } from "./rules"

/** Repository-audited originals only; saved review JSON never supplies inputs. */
export function selectReferencedReviewedCostPostings(
  scope: { tenantId: string; bookId: string },
  prior: {
    journals: Array<
      Pick<PriorCostReviewSnapshot["journals"][number], "journalEntryId">
    >
    evidence: Array<
      Pick<PriorCostReviewSnapshot["evidence"][number], "sourceJournalEntryId">
    >
  },
  originals: PriorCostReviewExpectedPosting[],
) {
  const references = new Set([
    ...prior.journals.map((row) => row.journalEntryId),
    ...prior.evidence.flatMap((row) =>
      row.sourceJournalEntryId === null ? [] : [row.sourceJournalEntryId],
    ),
  ])
  if (references.size > 4096 || originals.length > 4096)
    throw new FinanceError("CONFLICT", "Original posting scope exceeds bounds.")
  const selected = new Map<string, PriorCostReviewExpectedPosting>()
  const commands = new Map<string, string>()
  for (const posting of originals) {
    if (
      posting.input.tenantId !== scope.tenantId ||
      posting.input.bookId !== scope.bookId
    )
      throw new FinanceError(
        "CONFLICT",
        "Original posting crosses Tenant/Book.",
      )
    if (!references.has(posting.entryId)) continue
    const previous = selected.get(posting.entryId)
    const commandEntry = commands.get(posting.input.clientCommandId)
    if (
      (previous &&
        financePayloadHash(previous) !== financePayloadHash(posting)) ||
      (commandEntry && commandEntry !== posting.entryId)
    )
      throw new FinanceError(
        "CONFLICT",
        "Original posting ownership conflicts.",
      )
    selected.set(posting.entryId, structuredClone(posting))
    commands.set(posting.input.clientCommandId, posting.entryId)
  }
  return [...selected.values()].sort((a, b) =>
    a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
  )
}
