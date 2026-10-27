import type { createFinanceCommandRunner } from "@/lib/finance-command-runner"
import {
  FinanceCommandNotSentError,
  type FinanceCommandRecoveryMetadata,
  type PendingFinanceCommand,
} from "@ewatrade/utils/finance-command-identity"
import {
  NATIVE_BANK_STALE_REVIEW,
  type NativeBankMatchAction,
  assertNativeBankReviewUnchanged,
  nativeBankMatchReason,
  nativeBankMatchSelection,
  nativeBankUnmatchEvidence,
} from "./finance-bank-match-state"

type Runner = ReturnType<typeof createFinanceCommandRunner>

export const NATIVE_BANK_MATCH_OPERATIONS = {
  MATCH: "matchBankStatement",
  UNMATCH: "unmatchBankStatement",
} as const

/** The fresh, already validated statement read the command checks against. */
export type NativeBankMatchSource = {
  bookId: string
  accountId: string
  bankRevision: string
  snapshotSequence: string
  statement: { id: string }
  rows: {
    id: string
    externalId: string
    amountMinor: string
    activeMatchId: string | null
  }[]
  candidates: {
    id: string
    sequence: string
    description: string
    amountMinor: string
  }[]
}
export type NativeBankMatchEvent = {
  id: string
  kind: string
  revision: string
  bankRows: unknown
  journalLines: unknown
  amountMinor: string
}
type ReviewRecord = { id: string; label: string; amountMinor: string }
export type NativeBankMatchReview = {
  action: NativeBankMatchAction
  statementId: string
  payload: {
    bookId: string
    accountId: string
    expectedRevision: string
    expectedSnapshotSequence: string
    reason: string
  }
  amountMinor: string
  bankRecords: ReviewRecord[]
  postedRecords: ReviewRecord[]
  /** True when this review re-enters a saved, unconfirmed submission. */
  retry: boolean
}
export type NativeBankMatchInput = NativeBankMatchReview["payload"] & {
  clientCommandId: string
  bankRowIds: string[]
  journalLineIds: string[]
}
export type NativeBankUnmatchInput = NativeBankMatchReview["payload"] & {
  clientCommandId: string
  matchId: string
}
// Refusals meaning the reviewed evidence moved; the screen offers Refresh.
export function isNativeBankStaleRefusal(message: string) {
  return STALE_MESSAGES.has(message)
}
const STALE_MESSAGES = new Set([
  NATIVE_BANK_STALE_REVIEW,
  "Selected sources changed. Refresh the statement review.",
  "This match was already undone or has changed.",
])
type Reads = {
  readSource: () => Promise<NativeBankMatchSource>
  readMatchEvent: (matchRevision: string) => Promise<NativeBankMatchEvent>
  isCurrent: () => boolean
}

function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent())
    throw new Error(
      "Finance access or connection changed. Review the match again.",
    )
}

function copyAction(action: NativeBankMatchAction): NativeBankMatchAction {
  return action.kind === "MATCH"
    ? {
        kind: "MATCH",
        bankRowIds: [...action.bankRowIds].sort(),
        journalLineIds: [...action.journalLineIds].sort(),
      }
    : {
        kind: "UNMATCH",
        matchId: action.matchId,
        matchRevision: action.matchRevision,
      }
}

/**
 * The saved retry identity for this statement. Null when nothing is retained;
 * throws when the retained submission belongs to something else, since only
 * its exact original details may be sent next.
 */
export function nativeBankMatchRecovery(
  retained: PendingFinanceCommand | undefined | null,
  scope: { accountId: string; statementId: string },
) {
  if (!retained) return null
  const metadata = retained.recoveryMetadata
  const review = metadata?.bankReview
  if (
    !review ||
    retained.operation !== NATIVE_BANK_MATCH_OPERATIONS[review.action] ||
    metadata.accountId !== scope.accountId ||
    review.statementId !== scope.statementId ||
    !metadata.expectedBankRevision ||
    !metadata.expectedSnapshotSequence
  )
    throw new Error(
      "Check the earlier submission's result first, or finish it from its original screen.",
    )
  const expected = {
    expectedRevision: metadata.expectedBankRevision,
    expectedSnapshotSequence: metadata.expectedSnapshotSequence,
  }
  if (review.action === "MATCH" && review.bankRowIds && review.journalLineIds)
    return {
      ...expected,
      action: copyAction({
        kind: "MATCH",
        bankRowIds: review.bankRowIds,
        journalLineIds: review.journalLineIds,
      }),
    }
  if (review.action === "UNMATCH" && review.matchId && review.matchRevision)
    return {
      ...expected,
      action: copyAction({
        kind: "UNMATCH",
        matchId: review.matchId,
        matchRevision: review.matchRevision,
      }),
    }
  throw new Error("The saved match is incomplete.")
}

async function evidenceFor(
  source: NativeBankMatchSource,
  action: NativeBankMatchAction,
  reads: Reads,
) {
  if (action.kind === "MATCH") {
    const group = nativeBankMatchSelection(
      source,
      action.bankRowIds,
      action.journalLineIds,
    )
    return {
      amountMinor: group.amountMinor,
      bankRecords: group.bank.map((row) => ({
        id: row.id,
        label: row.externalId,
        amountMinor: row.amountMinor,
      })),
      postedRecords: group.journal.map((line) => ({
        id: line.id,
        label: `Record ${line.sequence} · ${line.description}`,
        amountMinor: line.amountMinor,
      })),
    }
  }
  const event = await reads.readMatchEvent(action.matchRevision)
  assertCurrent(reads.isCurrent)
  const evidence = nativeBankUnmatchEvidence(source, event, action)
  return {
    amountMinor: evidence.amountMinor,
    bankRecords: evidence.bank.map((row) => ({
      id: row.id,
      label: row.externalId,
      amountMinor: row.amountMinor,
    })),
    postedRecords: evidence.journal.map((line) => ({
      id: line.id,
      label: `Record ${line.sequence}`,
      amountMinor: (
        BigInt(line.debitMinor) - BigInt(line.creditMinor)
      ).toString(),
    })),
  }
}

function assertScope(
  source: NativeBankMatchSource,
  scope: { bookId: string; accountId: string; statementId: string },
) {
  if (
    source.bookId !== scope.bookId ||
    source.accountId !== scope.accountId ||
    source.statement.id !== scope.statementId
  )
    throw new Error("These records belong to another account.")
}

/** Fresh read, exact group check and reason; a retry keeps its saved identity. */
export async function prepareNativeBankMatchReview(
  input: Reads & {
    action: NativeBankMatchAction
    reason: string
    bookId: string
    accountId: string
    statementId: string
    retained?: PendingFinanceCommand | null
    /** The revisions the person looked at; a new attempt must still match them. */
    reviewed?: { expectedRevision: string; expectedSnapshotSequence: string }
  },
): Promise<NativeBankMatchReview> {
  assertCurrent(input.isCurrent)
  const reason = nativeBankMatchReason(input.reason)
  const recovery = nativeBankMatchRecovery(input.retained, input)
  if (recovery && recovery.action.kind !== input.action.kind)
    throw new Error(
      "Only the same action can be retried. Check the saved result first.",
    )
  const action = recovery?.action ?? copyAction(input.action)
  const source = await input.readSource()
  assertCurrent(input.isCurrent)
  assertScope(source, input)
  if (!recovery && input.reviewed)
    assertNativeBankReviewUnchanged(source, {
      ...input,
      ...input.reviewed,
    })
  const evidence = await evidenceFor(source, action, input)
  assertCurrent(input.isCurrent)
  return {
    ...evidence,
    action,
    statementId: input.statementId,
    retry: Boolean(recovery),
    payload: {
      bookId: input.bookId,
      accountId: input.accountId,
      expectedRevision: recovery?.expectedRevision ?? source.bankRevision,
      expectedSnapshotSequence:
        recovery?.expectedSnapshotSequence ?? source.snapshotSequence,
      reason,
    },
  }
}

/**
 * Runs the reviewed match or unmatch once through the shared runner. The
 * runner owns the command ID, lock, status check and exact re-entry; recovery
 * metadata holds only the account, statement, revisions and the selected
 * identities. Reasons and amounts stay inside the salted digest.
 */
export async function submitNativeBankMatchReview(
  input: Reads & {
    review: NativeBankMatchReview
    run: (...args: Parameters<Runner["run"]>) => Promise<unknown>
    write: {
      match: (payload: NativeBankMatchInput) => Promise<unknown>
      unmatch: (payload: NativeBankUnmatchInput) => Promise<unknown>
    }
    onStale?: () => void
  },
) {
  const action = copyAction(input.review.action)
  const statementId = input.review.statementId
  const base = { ...input.review.payload }
  assertCurrent(input.isCurrent)
  const payload =
    action.kind === "MATCH"
      ? {
          ...base,
          bankRowIds: [...action.bankRowIds],
          journalLineIds: [...action.journalLineIds],
        }
      : { ...base, matchId: action.matchId }
  const recoveryMetadata: FinanceCommandRecoveryMetadata = {
    accountId: base.accountId,
    expectedBankRevision: base.expectedRevision,
    expectedSnapshotSequence: base.expectedSnapshotSequence,
    bankReview:
      action.kind === "MATCH"
        ? {
            statementId,
            action: "MATCH",
            bankRowIds: [...action.bankRowIds],
            journalLineIds: [...action.journalLineIds],
          }
        : {
            statementId,
            action: "UNMATCH",
            matchId: action.matchId,
            matchRevision: action.matchRevision,
          },
  }
  return input.run(
    NATIVE_BANK_MATCH_OPERATIONS[action.kind],
    payload,
    async (clientCommandId) => {
      try {
        assertCurrent(input.isCurrent)
        const source = await input.readSource()
        assertCurrent(input.isCurrent)
        assertScope(source, { ...base, statementId })
        assertNativeBankReviewUnchanged(source, { ...base, statementId })
        await evidenceFor(source, action, input)
        assertCurrent(input.isCurrent)
      } catch (failure) {
        const message =
          failure instanceof Error
            ? failure.message
            : "We couldn't check the original records."
        if (STALE_MESSAGES.has(message)) input.onStale?.()
        throw new FinanceCommandNotSentError(message)
      }
      // Only pre-transport failures carry NotSent. Transport errors stay uncertain.
      if (action.kind === "MATCH")
        return input.write.match({
          ...base,
          bankRowIds: [...action.bankRowIds],
          journalLineIds: [...action.journalLineIds],
          clientCommandId,
        })
      return input.write.unmatch({
        ...base,
        matchId: action.matchId,
        clientCommandId,
      })
    },
    { recoveryMetadata },
  )
}
