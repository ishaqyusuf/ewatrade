import { z } from "zod"

/**
 * Pure matching rules for the native statement review (Workshop
 * mobile/bank-matching 01 "Pick both sides"). Ported from the dashboard
 * bank-match-state so both clients refuse the same groups.
 */
const id = z.string().trim().min(1).max(128)
const revision = z.string().regex(/^(0|[1-9]\d{0,18})$/)
const signed = z.string().regex(/^(0|-?[1-9]\d{0,18})$/)
const date = z.string().datetime()
const bankRows = z
  .array(
    z.object({
      id,
      statementId: id,
      externalId: id,
      occurredAt: date,
      amountMinor: signed,
    }),
  )
  .min(1)
  .max(50)
const journalLines = z
  .array(
    z.object({
      id,
      entryId: id,
      sequence: revision,
      effectiveAt: date,
      payloadHash: z.string().min(1),
      debitMinor: signed,
      creditMinor: signed,
    }),
  )
  .min(1)
  .max(50)

export const NATIVE_BANK_MATCH_MAX_IDS = 50
export const NATIVE_BANK_REASON_MAX = 400

export type NativeBankMatchAction =
  | { kind: "MATCH"; bankRowIds: string[]; journalLineIds: string[] }
  | { kind: "UNMATCH"; matchId: string; matchRevision: string }

export type NativeBankMatchEvidence = ReturnType<typeof nativeBankMatchEvidence>

/** Validate an original MATCH/UNMATCH history event's immutable evidence. */
export function nativeBankMatchEvidence(event: {
  bankRows: unknown
  journalLines: unknown
  amountMinor: string
}) {
  const bank = bankRows.parse(event.bankRows)
  const journal = journalLines.parse(event.journalLines)
  if (
    new Set(bank.map((row) => row.id)).size !== bank.length ||
    new Set(bank.map((row) => row.statementId)).size !== 1 ||
    new Set(journal.map((line) => line.id)).size !== journal.length
  )
    throw new Error("Original matching identities are incomplete.")
  const bankMinor = bank.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
  const postedMinor = journal.reduce((sum, line) => {
    const debit = BigInt(line.debitMinor)
    const credit = BigInt(line.creditMinor)
    if (debit < 0n || credit < 0n || (debit === 0n) === (credit === 0n))
      throw new Error("Original posted evidence is invalid.")
    return sum + debit - credit
  }, 0n)
  if (
    bankMinor !== postedMinor ||
    bankMinor.toString() !== signed.parse(event.amountMinor)
  )
    throw new Error("Original matching amounts cannot be verified.")
  return { bank, journal, amountMinor: bankMinor.toString() }
}

type SelectableRow = {
  id: string
  amountMinor: string
  activeMatchId: string | null
}
type SelectableLine = { id: string; amountMinor: string }

/** Exact, sorted group for the match command; throws the refusal reason. */
export function nativeBankMatchSelection<
  Row extends SelectableRow,
  Line extends SelectableLine,
>(
  data: { rows: Row[]; candidates: Line[] },
  bankRowIds: readonly string[],
  journalLineIds: readonly string[],
) {
  const selected = (ids: readonly string[]) => {
    if (
      ids.length < 1 ||
      ids.length > NATIVE_BANK_MATCH_MAX_IDS ||
      new Set(ids).size !== ids.length ||
      ids.some((value) => !id.safeParse(value).success)
    )
      throw new Error("Select between 1 and 50 complete records on each side.")
    return [...ids].sort()
  }
  const bankIds = selected(bankRowIds)
  const lineIds = selected(journalLineIds)
  const rows = bankIds.map((value) => data.rows.find((row) => row.id === value))
  const lines = lineIds.map((value) =>
    data.candidates.find((line) => line.id === value),
  )
  if (
    rows.some((row) => !row || row.activeMatchId) ||
    lines.some((line) => !line)
  )
    throw new Error("Selected sources changed. Refresh the statement review.")
  const bank = rows.filter((row): row is Row => row !== undefined)
  const journal = lines.filter((line): line is Line => line !== undefined)
  const bankMinor = bank.reduce(
    (sum, row) => sum + BigInt(signed.parse(row.amountMinor)),
    0n,
  )
  const postedMinor = journal.reduce(
    (sum, line) => sum + BigInt(signed.parse(line.amountMinor)),
    0n,
  )
  if (bankMinor !== postedMinor)
    throw new Error(
      "Selected totals differ. Review the full group or correct its original source.",
    )
  return {
    bankRowIds: bankIds,
    journalLineIds: lineIds,
    bank,
    journal,
    amountMinor: bankMinor.toString(),
  }
}

/** Footer totals; never throws, so a partial selection still shows its sums. */
export function nativeBankSelectionTotals(
  data: { rows: SelectableRow[]; candidates: SelectableLine[] },
  bankRowIds: readonly string[],
  journalLineIds: readonly string[],
) {
  const total = (items: SelectableLine[], ids: readonly string[]) =>
    items
      .filter((item) => ids.includes(item.id))
      .reduce(
        (sum, item) =>
          sum +
          (signed.safeParse(item.amountMinor).success
            ? BigInt(item.amountMinor)
            : 0n),
        0n,
      )
  const bankMinor = total(data.rows, bankRowIds)
  const postedMinor = total(data.candidates, journalLineIds)
  const difference = bankMinor - postedMinor
  const both = bankRowIds.length > 0 && journalLineIds.length > 0
  let error: string | null = null
  try {
    nativeBankMatchSelection(data, bankRowIds, journalLineIds)
  } catch (failure) {
    error =
      failure instanceof Error ? failure.message : "Check what you selected."
  }
  return {
    bankMinor: bankMinor.toString(),
    postedMinor: postedMinor.toString(),
    differenceMinor: (difference < 0n ? -difference : difference).toString(),
    count: bankRowIds.length + journalLineIds.length,
    both,
    equal: both && difference === 0n,
    error,
  }
}

/** Add or remove one id, never above the 50-per-side command limit. */
export function toggleNativeBankSelection(
  values: readonly string[],
  value: string,
) {
  if (values.includes(value)) return values.filter((item) => item !== value)
  if (values.length >= NATIVE_BANK_MATCH_MAX_IDS) return [...values]
  return [...values, value]
}

export function nativeBankMatchReason(value: string) {
  const reason = value.trim()
  if (!reason || reason.length > NATIVE_BANK_REASON_MAX)
    throw new Error("Enter a reason of 1 to 400 characters.")
  return reason
}

export const NATIVE_BANK_STALE_REVIEW =
  "Bank evidence or posted records changed. Refresh and review again."

export function assertNativeBankReviewUnchanged(
  current: {
    bookId: string
    accountId: string
    bankRevision: string
    snapshotSequence: string
    statement: { id: string }
  },
  reviewed: {
    bookId: string
    accountId: string
    expectedRevision: string
    expectedSnapshotSequence: string
    statementId: string
  },
) {
  if (
    current.bookId !== reviewed.bookId ||
    current.accountId !== reviewed.accountId ||
    current.statement.id !== reviewed.statementId ||
    current.bankRevision !== reviewed.expectedRevision ||
    current.snapshotSequence !== reviewed.expectedSnapshotSequence
  )
    throw new Error(NATIVE_BANK_STALE_REVIEW)
}

/**
 * An UNMATCH may only release a MATCH whose every original bank row is still
 * active under that match in this exact statement.
 */
export function nativeBankUnmatchEvidence(
  source: {
    statement: { id: string }
    rows: { id: string; activeMatchId: string | null }[]
  },
  event: {
    id: string
    kind: string
    revision: string
    bankRows: unknown
    journalLines: unknown
    amountMinor: string
  },
  expected: { matchId: string; matchRevision: string },
) {
  if (
    event.id !== expected.matchId ||
    event.kind !== "MATCH" ||
    event.revision !== expected.matchRevision
  )
    throw new Error("We couldn't check the original match.")
  const evidence = nativeBankMatchEvidence(event)
  if (
    evidence.bank.some(
      (row) =>
        row.statementId !== source.statement.id ||
        !source.rows.some(
          (current) =>
            current.id === row.id && current.activeMatchId === event.id,
        ),
    ) ||
    source.rows.filter((row) => row.activeMatchId === event.id).length !==
      evidence.bank.length
  )
    throw new Error("This match was already undone or has changed.")
  return evidence
}

/**
 * Matched groups on this statement, keyed by active match. A group whose
 * history event is not loaded (or fails validation) cannot be undone here.
 */
export function nativeBankMatchedGroups<
  Row extends SelectableRow,
  Event extends {
    id: string
    kind: string
    revision: string
    reason: string
    bankRows: unknown
    journalLines: unknown
    amountMinor: string
  },
>(rows: Row[], events: Event[]) {
  const ids = [
    ...new Set(
      rows.flatMap((row) => (row.activeMatchId ? [row.activeMatchId] : [])),
    ),
  ]
  return ids.map((matchId) => {
    const groupRows = rows.filter((row) => row.activeMatchId === matchId)
    const event = events.find(
      (item) => item.id === matchId && item.kind === "MATCH",
    )
    let evidence: NativeBankMatchEvidence | null = null
    if (event)
      try {
        evidence = nativeBankMatchEvidence(event)
      } catch {
        evidence = null
      }
    return {
      matchId,
      rows: groupRows,
      amountMinor: groupRows
        .reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
        .toString(),
      event: event ?? null,
      evidence,
      canUndo: Boolean(event && evidence),
    }
  })
}
