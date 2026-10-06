import { z } from "zod"

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

export function bankMatchEvidence(event: {
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

export function bankMatchSelection<
  Row extends { id: string; amountMinor: string; activeMatchId: string | null },
  Line extends { id: string; amountMinor: string },
>(
  data: { rows: Row[]; candidates: Line[] },
  bankRowIds: readonly string[],
  journalLineIds: readonly string[],
) {
  const selected = (ids: readonly string[]) => {
    if (
      ids.length < 1 ||
      ids.length > 50 ||
      new Set(ids).size !== ids.length ||
      ids.some((value) => !id.safeParse(value).success)
    )
      throw new Error("Select between 1 and 50 complete records on each side.")
    return [...ids].sort()
  }
  const bankIds = selected(bankRowIds)
  const lineIds = selected(journalLineIds)
  const rows = bankIds.map((id) => data.rows.find((row) => row.id === id))
  const lines = lineIds.map((id) =>
    data.candidates.find((line) => line.id === id),
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

export function bankMatchReason(value: string) {
  const reason = value.trim()
  if (!reason || reason.length > 400)
    throw new Error("Enter a reason of 1 to 400 characters.")
  return reason
}

export function assertBankReviewUnchanged(
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
    throw new Error(
      "Bank evidence or posted records changed. Refresh and review again.",
    )
}
