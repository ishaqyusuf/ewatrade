import type { FinancePostingInput } from "./posting"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
  validateFinanceLines,
} from "./rules"

const MAX_ENTRIES = 4096
const MAX_LINES = 32768
const MAX_SEQUENCE = 9223372036854775807n

type JournalLine = {
  id: string
  bookId: string
  entryId: string
  accountId: string
  debitMinor: bigint
  creditMinor: bigint
  description: string | null
}
type Journal = {
  id: string
  bookId: string
  sequence: bigint
  sourceKind: string
  sourceId: string
  payloadHash: string
  description: string
  storeId: string | null
  actorUserId: string
  effectiveAt: Date
  recordedAt: Date
  reversalOfId: string | null
  reversal: { id: string } | null
  _count: { lines: number }
}
type PostingCommand = {
  id: string
  bookId: string
  clientCommandId: string
  kind: string
  payloadHash: string
  actorUserId: string
  result: unknown
}
export type PriorCostReviewJournalFacts = {
  entries: Journal[]
  lines: JournalLine[]
  accounts: Array<{ id: string; bookId: string }>
  stores: Array<{ id: string; tenantId: string; currencyCode: string }>
  postingCommands: PostingCommand[]
}
/** These inputs must be derived by an existing repository source adapter, never decoded by guessing review JSON. */
export type PriorCostReviewExpectedPosting = {
  entryId: string
  input: FinancePostingInput
}
type Book = {
  id: string
  tenantId: string
  currencyCode: string
  lastSequence: bigint
}
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", `Prior review journal ${message}`)
}
function unique<T extends { id: string }>(rows: T[], maximum = MAX_ENTRIES) {
  const result = new Map(rows.map((row) => [row.id, row]))
  if (
    rows.length > maximum ||
    result.size !== rows.length ||
    rows.some((row) => !row.id.trim())
  )
    conflict(
      "identities are duplicated, missing or exceed complete supported bounds.",
    )
  return result
}
function exact(expected: Set<string>, actual: Set<string>) {
  if (
    expected.size !== actual.size ||
    [...actual].some((id) => !expected.has(id))
  )
    conflict("facts differ from complete required identities.")
}
function validDate(date: Date) {
  return Number.isFinite(date.getTime())
}
function lineKey(
  line: Pick<
    JournalLine,
    "accountId" | "debitMinor" | "creditMinor" | "description"
  >,
) {
  return financePayloadHash({
    accountId: line.accountId,
    debitMinor: line.debitMinor,
    creditMinor: line.creditMinor,
    description: line.description,
  })
}
function sortedLines(
  lines: Array<
    Pick<
      JournalLine,
      "accountId" | "debitMinor" | "creditMinor" | "description"
    >
  >,
) {
  return lines.map(lineKey).sort()
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Pure bounded read proposal, not an executable loader or new saved-plan contract. */
export function planPriorCostReviewJournalFactRead(
  prior: PriorCostReviewSnapshot,
  expectedPostings: PriorCostReviewExpectedPosting[] = [],
) {
  if (
    !prior.reviews.length &&
    !prior.journals.length &&
    !prior.evidence.length
  ) {
    if (expectedPostings.length)
      conflict("original posting inputs have no prior review references.")
    return null
  }
  unique(prior.reviews)
  unique(prior.journals)
  unique(prior.evidence)
  const journalEntryIds = new Set([
    ...prior.journals.map((row) => row.journalEntryId),
    ...prior.evidence.flatMap((row) =>
      row.sourceJournalEntryId === null ? [] : [row.sourceJournalEntryId],
    ),
  ])
  if (
    journalEntryIds.size > MAX_ENTRIES ||
    [...journalEntryIds].some((id) => !id.trim()) ||
    expectedPostings.length > MAX_ENTRIES
  )
    conflict("complete journal reference scope exceeds supported bounds.")
  const postingCommandIds = new Set<string>()
  for (const expected of expectedPostings) {
    if (
      !journalEntryIds.size ||
      !expected.entryId.trim() ||
      !expected.input.clientCommandId.trim() ||
      postingCommandIds.has(expected.input.clientCommandId)
    )
      conflict(
        "expected original posting is outside review references or duplicates a command.",
      )
    postingCommandIds.add(expected.input.clientCommandId)
  }
  return {
    journalEntryIds: [...journalEntryIds].sort(),
    expectedRelatedEntryIds: [
      ...new Set(expectedPostings.map((expected) => expected.entryId)),
    ].sort(),
    postingCommandIds: [...postingCommandIds].sort(),
    reviewConfirmationCommandIds: [
      ...new Set(prior.reviews.map((row) => row.clientCommandId)),
    ].sort(),
    entryTake: MAX_ENTRIES + 1,
    lineTake: MAX_LINES + 1,
    accountTake: MAX_ENTRIES + 1,
    commandTake: MAX_ENTRIES + 1,
    requiresCompleteReversalClosure: true as const,
    requiresHeaderLineCounts: true as const,
    requiresHeldBookAndSourceLocks: true as const,
  }
}

/**
 * Prove stored journal facts and exact supported-source posting fingerprints.
 * No runtime prior-cost confirmation writer/JSON decoder exists, so this always
 * retains saved-plan/source-snapshot ownership and confirmation requirements.
 */
export function auditPriorCostReviewJournalProof(input: {
  book: Book
  prior: PriorCostReviewSnapshot
  facts: PriorCostReviewJournalFacts
  expectedPostings?: PriorCostReviewExpectedPosting[]
}) {
  const { book, prior, facts } = input
  const expectedPostings = input.expectedPostings ?? []
  const read = planPriorCostReviewJournalFactRead(prior, expectedPostings)
  if (
    !book.id.trim() ||
    !book.tenantId.trim() ||
    !book.currencyCode.trim() ||
    book.lastSequence < 0n ||
    book.lastSequence > MAX_SEQUENCE
  )
    conflict("held Tenant/Book/currency/watermark is invalid.")
  const reviews = unique(prior.reviews)
  const links = unique(prior.journals)
  unique(prior.evidence)
  const entries = unique(facts.entries)
  const lines = unique(facts.lines, MAX_LINES)
  const accounts = unique(facts.accounts)
  const stores = unique(facts.stores)
  const commands = unique(facts.postingCommands)
  for (const row of [...prior.reviews, ...prior.journals, ...prior.evidence]) {
    if (
      row.bookId !== book.id ||
      row.tenantId !== book.tenantId ||
      ("reviewId" in row && !reviews.has(row.reviewId))
    )
      conflict("review/reference crosses Tenant/Book or lacks its header.")
  }
  for (const review of reviews.values()) {
    if (
      review._count.journals !==
        prior.journals.filter((row) => row.reviewId === review.id).length ||
      review._count.evidence !==
        prior.evidence.filter((row) => row.reviewId === review.id).length
    )
      conflict("reference header count differs from complete loaded links.")
  }
  const groups = new Set<string>()
  const adjustmentOwners = new Set<string>()
  for (const link of links.values()) {
    const group = JSON.stringify([link.reviewId, link.groupKey])
    if (
      !link.groupKey.trim() ||
      groups.has(group) ||
      adjustmentOwners.has(link.journalEntryId)
    )
      conflict("adjustment journal ownership/group is duplicated or missing.")
    groups.add(group)
    adjustmentOwners.add(link.journalEntryId)
  }
  const roots = new Set(read?.journalEntryIds ?? [])
  const reachable = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const id = pending.pop()
    if (!id || reachable.has(id)) continue
    const entry = entries.get(id)
    if (!entry)
      conflict("original journal or actual reversal closure is missing.")
    reachable.add(id)
    if (entry.reversalOfId) pending.push(entry.reversalOfId)
    if (entry.reversal) pending.push(entry.reversal.id)
  }
  exact(reachable, new Set(entries.keys()))
  const sequences = new Set<bigint>()
  const sourceKeys = new Set<string>()
  const requiredAccounts = new Set<string>()
  const requiredStores = new Set<string>()
  for (const entry of entries.values()) {
    const sourceKey = JSON.stringify([entry.sourceKind, entry.sourceId])
    if (
      entry.bookId !== book.id ||
      entry.sequence <= 0n ||
      entry.sequence > book.lastSequence ||
      entry.sequence > MAX_SEQUENCE ||
      sequences.has(entry.sequence) ||
      !entry.sourceKind.trim() ||
      entry.sourceKind.length > 64 ||
      !entry.sourceId.trim() ||
      entry.sourceId.length > 128 ||
      sourceKeys.has(sourceKey) ||
      !entry.actorUserId.trim() ||
      !entry.description.trim() ||
      entry.description !== entry.description.trim() ||
      entry.description.length > 500 ||
      !/^[a-f0-9]{64}$/.test(entry.payloadHash) ||
      !validDate(entry.effectiveAt) ||
      !validDate(entry.recordedAt)
    )
      conflict(
        "entry scope, source, sequence, date or immutable identity is invalid.",
      )
    sequences.add(entry.sequence)
    sourceKeys.add(sourceKey)
    if (entry.storeId !== null) requiredStores.add(entry.storeId)
    const entryLines = facts.lines.filter((line) => line.entryId === entry.id)
    if (
      !Number.isSafeInteger(entry._count.lines) ||
      entry._count.lines !== entryLines.length ||
      entryLines.length < 2 ||
      entryLines.length > 100
    )
      conflict(
        "original entry line count differs from complete supported rows.",
      )
    let debit = 0n
    let credit = 0n
    for (const line of entryLines) {
      if (
        line.bookId !== book.id ||
        !line.accountId.trim() ||
        line.debitMinor < 0n ||
        line.creditMinor < 0n ||
        line.debitMinor > 0n === line.creditMinor > 0n ||
        (line.description !== null &&
          (!line.description.trim() ||
            line.description !== line.description.trim()))
      )
        conflict(
          "line scope, sides, amount or immutable description is invalid.",
        )
      try {
        financeAmount((line.debitMinor || line.creditMinor).toString())
      } catch {
        conflict("original line exceeds the supported posting amount bound.")
      }
      debit += line.debitMinor
      credit += line.creditMinor
      requiredAccounts.add(line.accountId)
    }
    if (debit !== credit) conflict("original journal is not exactly balanced.")
    if (entry.reversalOfId !== null) {
      const original = entries.get(entry.reversalOfId)
      if (
        !original ||
        original.reversalOfId !== null ||
        original.reversal?.id !== entry.id ||
        entry.reversal !== null ||
        entry.sequence <= original.sequence ||
        entry.recordedAt < original.recordedAt ||
        entry.effectiveAt < original.effectiveAt ||
        entry.storeId !== original.storeId
      )
        conflict(
          "inverse identity, scope, chronology or actual original state is inconsistent.",
        )
      const originalLines = facts.lines.filter(
        (line) => line.entryId === original.id,
      )
      const inverse = originalLines.map((line) => ({
        accountId: line.accountId,
        debitMinor: line.creditMinor,
        creditMinor: line.debitMinor,
        description: line.description,
      }))
      if (
        financePayloadHash(sortedLines(entryLines)) !==
        financePayloadHash(sortedLines(inverse))
      )
        conflict(
          "inverse differs from exact original accounts, line amounts or descriptions.",
        )
    } else if (entry.reversal) {
      if (entries.get(entry.reversal.id)?.reversalOfId !== entry.id)
        conflict("actual reversal does not point back to its original journal.")
    }
  }
  if ([...lines.values()].some((line) => !entries.has(line.entryId)))
    conflict("line belongs to an undiscovered journal.")
  exact(requiredAccounts, new Set(accounts.keys()))
  exact(requiredStores, new Set(stores.keys()))
  for (const account of accounts.values())
    if (account.bookId !== book.id)
      conflict("original account crosses Book scope.")
  for (const store of stores.values())
    if (
      store.tenantId !== book.tenantId ||
      store.currencyCode !== book.currencyCode
    )
      conflict("original Store crosses Tenant/currency scope.")
  const commandKeys = new Set<string>()
  for (const command of commands.values()) {
    if (
      command.bookId !== book.id ||
      !command.clientCommandId.trim() ||
      commandKeys.has(command.clientCommandId)
    )
      conflict("posting command scope or identity is invalid.")
    commandKeys.add(command.clientCommandId)
  }
  exact(new Set(read?.postingCommandIds ?? []), commandKeys)
  const provedIds = new Set<string>()
  for (const expected of expectedPostings) {
    const entry = entries.get(expected.entryId)
    const posting = expected.input
    if (
      !entry ||
      provedIds.has(entry.id) ||
      posting.tenantId !== book.tenantId ||
      posting.bookId !== book.id ||
      posting.actorUserId !== entry.actorUserId ||
      posting.clientCommandId.length > 128 ||
      posting.sourceKind !== entry.sourceKind ||
      posting.sourceId !== entry.sourceId ||
      posting.description.trim() !== entry.description ||
      !validDate(posting.effectiveAt) ||
      posting.effectiveAt.getTime() !== entry.effectiveAt.getTime() ||
      (posting.storeId ?? null) !== entry.storeId ||
      (posting.reversalOfId ?? null) !== entry.reversalOfId
    )
      conflict(
        "entry differs from its exact repository original posting source.",
      )
    let normalized: ReturnType<typeof validateFinanceLines>
    try {
      normalized = validateFinanceLines(posting.lines)
    } catch {
      conflict("original source posting lines are invalid.")
    }
    const entryLines = facts.lines.filter((line) => line.entryId === entry.id)
    if (
      financePayloadHash(sortedLines(normalized)) !==
      financePayloadHash(sortedLines(entryLines))
    )
      conflict(
        "entry differs from exact original posted accounts/amounts/lines.",
      )
    // The writer hashes the source-derived array order. Persisted lines have no ordinal;
    // IDs or a balanced aggregate cannot reconstruct that original authority.
    const payloadHash = financePayloadHash({
      sourceKind: posting.sourceKind,
      sourceId: posting.sourceId,
      description: posting.description.trim(),
      effectiveAt: posting.effectiveAt,
      storeId: posting.storeId ?? null,
      lines: normalized,
      ...(posting.reversalOfId ? { reversalOfId: posting.reversalOfId } : {}),
    })
    const command = facts.postingCommands.find(
      (row) => row.clientCommandId === posting.clientCommandId,
    )
    const result = object(command?.result)
    if (
      entry.payloadHash !== payloadHash ||
      !command ||
      command.kind !== "POST_JOURNAL" ||
      command.payloadHash !== payloadHash ||
      command.actorUserId !== posting.actorUserId ||
      result?.entryId !== entry.id ||
      result?.sequence !== entry.sequence.toString()
    )
      conflict(
        "entry fingerprint or actual original command result/sequence differs.",
      )
    provedIds.add(entry.id)
  }
  const blockers = [
    ...[...entries.keys()]
      .filter((id) => !provedIds.has(id))
      .sort()
      .map((sourceId) => ({
        code: "PRIOR_JOURNAL_ORIGINAL_POSTING_INPUT_REQUIRED" as const,
        sourceId,
      })),
    ...prior.evidence
      .filter(
        (e) =>
          e.sourceJournalEntryId !== null &&
          (entries.get(e.sourceJournalEntryId)?.reversal !== null ||
            entries.get(e.sourceJournalEntryId)?.reversalOfId !== null),
      )
      .map((e) => ({
        code: "PRIOR_ORIGINAL_JOURNAL_STATE_REQUIRED" as const,
        sourceId: e.id,
      })),
    ...prior.journals
      .filter(
        (j) =>
          entries.get(j.journalEntryId)?.reversal !== null ||
          entries.get(j.journalEntryId)?.reversalOfId !== null,
      )
      .map((j) => ({
        code: "PRIOR_ADJUSTMENT_JOURNAL_STATE_REQUIRED" as const,
        sourceId: j.id,
      })),
    ...prior.reviews.map((review) => ({
      code: "PRIOR_SAVED_POSTING_PLAN_CONTRACT_REQUIRED" as const,
      sourceId: review.id,
    })),
    ...prior.reviews.map((review) => ({
      code: "PRIOR_SAVED_SOURCE_SNAPSHOT_CONTRACT_REQUIRED" as const,
      sourceId: review.id,
    })),
    { code: "PRIOR_CLASSIFICATION_PROOF_REQUIRED" as const },
    { code: "PRIOR_CONFIRMATION_PROOF_REQUIRED" as const },
  ]
  const proof = {
    scope: "PRIOR_COST_REVIEW_JOURNAL_FACTS" as const,
    referencedEntryIds: [...roots].sort(),
    provedOriginalPostingEntryIds: [...provedIds].sort(),
    inverseEntryIds: facts.entries
      .filter((entry) => entry.reversalOfId !== null)
      .map((entry) => entry.id)
      .sort(),
    postedJournalFactsProved:
      roots.size > 0 && [...entries.keys()].every((id) => provedIds.has(id)),
    reviewSavedPlanOwnershipProved: false as const,
    requiresPostedJournalOwnershipProof: true as const,
    blockers,
    requiresSavedPostingPlanProof: true as const,
    requiresOriginalSourceSnapshotProof: true as const,
    requiresClassificationProof: true as const,
    requiresMonetaryProof: true as const,
    requiresConfirmationProof: true as const,
    requiresPriorReviewProof: true as const,
  }
  return {
    ...proof,
    journalFactsHash: financePayloadHash({
      algorithmVersion: "prior-cost-review-journal-facts-v1",
      book,
      prior,
      facts,
      expectedPostings,
      proof,
    }),
  }
}
