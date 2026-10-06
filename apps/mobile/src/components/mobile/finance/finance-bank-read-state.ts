import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

const MAX_ID_LENGTH = 128
const MAX_ROWS = 500
const MAX_REVISION = 9_223_372_036_854_775_807n
const MIN_SIGNED = -9_223_372_036_854_775_808n
const MAX_SIGNED = 9_223_372_036_854_775_807n

export type NativeBankStatementPage =
  RouterOutputs["finance"]["bankStatements"]["list"]
export type NativeBankStatementDetail =
  RouterOutputs["finance"]["bankStatements"]["get"]
export type NativeBankCorrectionSource =
  RouterOutputs["finance"]["bankStatements"]["resolveCorrectionSource"]

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function id(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value
  )
}

function assertId(value: unknown, message: string): asserts value is string {
  if (!id(value)) throw new Error(message)
}

function assertText(
  value: unknown,
  maxLength: number,
  message: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  )
    throw new Error(message)
}

function signedMinor(value: unknown): value is string {
  if (typeof value !== "string" || !/^(0|-?[1-9]\d{0,18})$/.test(value))
    return false
  const amount = BigInt(value)
  return amount >= MIN_SIGNED && amount <= MAX_SIGNED
}

function assertSignedMinor(
  value: unknown,
  message: string,
): asserts value is string {
  if (!signedMinor(value)) throw new Error(message)
}

function unsignedRevision(value: unknown, allowZero = true): value is string {
  if (
    typeof value !== "string" ||
    !(allowZero ? /^(0|[1-9]\d{0,18})$/ : /^[1-9]\d{0,18}$/).test(value)
  )
    return false
  return BigInt(value) <= MAX_REVISION
}

function assertRevision(
  value: unknown,
  message: string,
): asserts value is string {
  if (!unsignedRevision(value)) throw new Error(message)
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function assertDate(value: unknown, message: string): asserts value is Date {
  if (!validDate(value)) throw new Error(message)
}

function currency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
}

function assertCommonScope(input: {
  bookId: string
  currencyCode: string
  actualBookId: unknown
  actualCurrencyCode: unknown
}) {
  assertId(input.bookId, "The requested finance book is invalid.")
  if (
    !currency(input.currencyCode) ||
    input.actualBookId !== input.bookId ||
    input.actualCurrencyCode !== input.currencyCode
  )
    throw new Error("Bank records no longer belong to this book and currency.")
}

function validateStatementListItem(
  item: unknown,
  input: { bookId: string; currencyCode: string; accountId?: string },
) {
  const value = record(item)
  if (!value)
    throw new Error("The bank statement page contains an invalid row.")
  assertId(value.id, "The bank statement identity is invalid.")
  assertId(value.accountId, "The bank statement account is invalid.")
  if (
    value.bookId !== input.bookId ||
    value.currencyCode !== input.currencyCode ||
    (input.accountId !== undefined && value.accountId !== input.accountId)
  )
    throw new Error("A bank statement belongs to a different account or book.")
  assertText(value.reference, 160, "The bank statement reference is invalid.")
  assertDate(value.startsAt, "The bank statement start date is invalid.")
  assertDate(value.endsAt, "The bank statement end date is invalid.")
  if (
    value.startsAt > value.endsAt ||
    value.startsAt.toISOString().slice(11) !== "00:00:00.000Z" ||
    value.endsAt.toISOString().slice(11) !== "23:59:59.999Z"
  )
    throw new Error("The bank statement period is invalid.")
  assertSignedMinor(
    value.openingBalanceMinor,
    "The opening balance is invalid.",
  )
  assertSignedMinor(
    value.closingBalanceMinor,
    "The closing balance is invalid.",
  )
  if (
    !Number.isSafeInteger(value.rowCount) ||
    (value.rowCount as number) < 0 ||
    (value.rowCount as number) > MAX_ROWS
  )
    throw new Error("The bank statement row count is outside the safe limit.")
  if (!unsignedRevision(value.importedRevision, false))
    throw new Error("The bank statement import revision is invalid.")
}

/** Validate a cursor page without asserting that separate pages share a snapshot. */
export function validateNativeBankStatementPage(input: {
  page: NativeBankStatementPage
  bookId: string
  currencyCode: string
  accountId?: string
  limit?: number
}): NativeBankStatementPage {
  const { page } = input
  const limit = input.limit ?? 30
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("The bank statement page size is invalid.")
  if (!page || !Array.isArray(page.items) || page.items.length > limit)
    throw new Error("The bank statement page exceeds its requested limit.")
  assertCommonScope({
    bookId: input.bookId,
    currencyCode: input.currencyCode,
    actualBookId: page.bookId,
    actualCurrencyCode: page.currencyCode,
  })
  if (input.accountId !== undefined)
    assertId(input.accountId, "The selected bank account is invalid.")

  const seen = new Set<string>()
  for (const item of page.items) {
    validateStatementListItem(item, input)
    if (seen.has(item.id))
      throw new Error("The bank statement page repeats a statement identity.")
    seen.add(item.id)
  }

  if (page.nextCursor !== null) {
    assertId(page.nextCursor, "The bank statement cursor is invalid.")
    const last = page.items.at(-1)
    if (!last || page.items.length !== limit || page.nextCursor !== last.id)
      throw new Error(
        "The bank statement cursor does not identify the last shown row.",
      )
  }
  return page
}

function validateBankRow(
  row: unknown,
  input: {
    startsAt: Date
    endsAt: Date
    seenIds: Set<string>
    seenExternalIds: Set<string>
    positions: Set<number>
  },
) {
  const value = record(row)
  if (!value) throw new Error("Original bank rows are incomplete.")
  assertId(value.id, "An original bank row identity is invalid.")
  assertId(value.externalId, "An original bank transaction ID is invalid.")
  if (typeof value.description !== "string" || value.description.length > 500)
    throw new Error("An original bank description is invalid.")
  assertDate(value.occurredAt, "An original bank transaction date is invalid.")
  assertSignedMinor(value.amountMinor, "An original bank amount is invalid.")
  if (
    !Number.isSafeInteger(value.position) ||
    (value.position as number) < 0 ||
    (value.position as number) >= MAX_ROWS ||
    value.occurredAt < input.startsAt ||
    value.occurredAt > input.endsAt ||
    !(value.activeMatchId === null || id(value.activeMatchId)) ||
    input.seenIds.has(value.id) ||
    input.seenExternalIds.has(value.externalId) ||
    input.positions.has(value.position as number)
  )
    throw new Error(
      "Original bank rows are duplicated or outside the statement.",
    )
  input.seenIds.add(value.id)
  input.seenExternalIds.add(value.externalId)
  input.positions.add(value.position as number)
}

function validateCandidate(
  candidate: unknown,
  input: {
    bookStartsAt: Date
    endsAt: Date
    snapshotSequence: string
    seenIds: Set<string>
  },
) {
  const value = record(candidate)
  if (!value) throw new Error("Posted bank candidates are incomplete.")
  assertId(value.id, "A posted journal line identity is invalid.")
  assertId(value.entryId, "A posted journal entry identity is invalid.")
  assertId(value.sourceKind, "A posted source kind is invalid.")
  assertId(value.sourceId, "A posted source identity is invalid.")
  assertText(
    value.description,
    2_000,
    "A posted journal description is invalid.",
  )
  assertDate(value.effectiveAt, "A posted journal date is invalid.")
  assertRevision(value.sequence, "A posted journal sequence is invalid.")
  assertSignedMinor(value.amountMinor, "A posted journal amount is invalid.")
  if (
    input.seenIds.has(value.id) ||
    value.effectiveAt < input.bookStartsAt ||
    value.effectiveAt > input.endsAt ||
    BigInt(value.sequence) > BigInt(input.snapshotSequence)
  )
    throw new Error("Posted candidates are duplicated or outside the snapshot.")
  input.seenIds.add(value.id)
}

/** Validate exact statement provenance and preserve bank, line, entry and source IDs independently. */
export function validateNativeBankStatementDetail(input: {
  detail: NativeBankStatementDetail
  bookId: string
  accountId: string
  currencyCode: string
  statementId: string
  bookStartsAt: Date | string
}): NativeBankStatementDetail {
  const { detail } = input
  if (!detail || !detail.statement)
    throw new Error("The original bank statement detail is unavailable.")
  assertCommonScope({
    bookId: input.bookId,
    currencyCode: input.currencyCode,
    actualBookId: detail.bookId,
    actualCurrencyCode: detail.currencyCode,
  })
  assertId(input.accountId, "The selected bank account is invalid.")
  assertId(input.statementId, "The selected statement identity is invalid.")
  if (
    detail.accountId !== input.accountId ||
    detail.statement.id !== input.statementId
  )
    throw new Error("The statement detail belongs to a different source.")
  assertText(
    detail.statement.reference,
    160,
    "The statement reference is invalid.",
  )
  assertRevision(detail.bankRevision, "The bank evidence revision is invalid.")
  assertRevision(detail.snapshotSequence, "The journal snapshot is invalid.")
  assertDate(detail.statement.startsAt, "The statement start date is invalid.")
  assertDate(detail.statement.endsAt, "The statement end date is invalid.")
  if (
    detail.statement.startsAt > detail.statement.endsAt ||
    detail.statement.startsAt.toISOString().slice(11) !== "00:00:00.000Z" ||
    detail.statement.endsAt.toISOString().slice(11) !== "23:59:59.999Z"
  )
    throw new Error("The statement period is invalid.")
  assertSignedMinor(
    detail.statement.openingBalanceMinor,
    "The statement opening balance is invalid.",
  )
  assertSignedMinor(
    detail.statement.closingBalanceMinor,
    "The statement closing balance is invalid.",
  )
  const bookStartsAt = new Date(input.bookStartsAt)
  if (!Number.isFinite(bookStartsAt.getTime()))
    throw new Error("The finance book start date could not be confirmed.")
  if (detail.statement.startsAt < bookStartsAt)
    throw new Error("The bank statement starts before this finance book.")
  if (
    !Number.isSafeInteger(detail.statement.rowCount) ||
    detail.statement.rowCount < 0 ||
    detail.statement.rowCount > MAX_ROWS ||
    !Array.isArray(detail.rows) ||
    detail.rows.length !== detail.statement.rowCount ||
    detail.rows.length > MAX_ROWS
  )
    throw new Error("Original bank rows are incomplete or over the safe limit.")

  const rowIds = new Set<string>()
  const externalIds = new Set<string>()
  const positions = new Set<number>()
  for (const row of detail.rows)
    validateBankRow(row, {
      startsAt: detail.statement.startsAt,
      endsAt: detail.statement.endsAt,
      seenIds: rowIds,
      seenExternalIds: externalIds,
      positions,
    })
  for (let position = 0; position < detail.rows.length; position += 1) {
    if (!positions.has(position))
      throw new Error("Original bank row positions are incomplete.")
  }

  if (!Array.isArray(detail.candidates) || detail.candidates.length > MAX_ROWS)
    throw new Error("Posted candidates exceed the safe review limit.")
  if (
    detail.candidateReviewLimit !== MAX_ROWS ||
    typeof detail.candidateCoverageComplete !== "boolean" ||
    detail.operationallyReconciled !== false ||
    detail.canReconcileClose !== false ||
    (!detail.candidateCoverageComplete && detail.candidates.length !== MAX_ROWS)
  )
    throw new Error(
      "Posted candidate coverage or reconciliation status is invalid.",
    )
  const candidateIds = new Set<string>()
  for (const candidate of detail.candidates)
    validateCandidate(candidate, {
      bookStartsAt,
      endsAt: detail.statement.endsAt,
      snapshotSequence: detail.snapshotSequence,
      seenIds: candidateIds,
    })

  assertSignedMinor(
    detail.postedOpeningMinor,
    "The posted opening amount is invalid.",
  )
  assertSignedMinor(
    detail.postedClosingMinor,
    "The posted closing amount is invalid.",
  )
  assertSignedMinor(
    detail.openingDifferenceMinor,
    "The opening difference is invalid.",
  )
  assertSignedMinor(
    detail.closingDifferenceMinor,
    "The closing difference is invalid.",
  )
  const unmatchedRows = detail.rows.filter((row) => row.activeMatchId === null)
  const unmatchedMinor = unmatchedRows.reduce(
    (sum, row) => sum + BigInt(row.amountMinor),
    0n,
  )
  if (
    detail.unmatchedBankRows !== unmatchedRows.length ||
    !signedMinor(detail.unmatchedBankMinor) ||
    BigInt(detail.unmatchedBankMinor) !== unmatchedMinor ||
    BigInt(detail.openingDifferenceMinor) !==
      BigInt(detail.statement.openingBalanceMinor) -
        BigInt(detail.postedOpeningMinor) ||
    BigInt(detail.closingDifferenceMinor) !==
      BigInt(detail.statement.closingBalanceMinor) -
        BigInt(detail.postedClosingMinor)
  )
    throw new Error("The bank differences do not match the original evidence.")
  return detail
}

/** Validate original correction-source provenance; entry and source/payment IDs remain separate. */
export function validateNativeBankCorrectionSource(input: {
  result: NativeBankCorrectionSource
  bookId: string
  accountId: string
  journalEntryId: string
}): NativeBankCorrectionSource {
  const { result } = input
  if (!result || !result.posted || !result.target)
    throw new Error("The posted bank source could not be confirmed.")
  assertId(input.bookId, "The requested finance book is invalid.")
  assertId(input.accountId, "The selected bank account is invalid.")
  assertId(input.journalEntryId, "The selected journal entry is invalid.")
  if (
    result.bookId !== input.bookId ||
    result.bankAccountId !== input.accountId ||
    result.journalEntryId !== input.journalEntryId
  )
    throw new Error("The posted source belongs to a different bank entry.")
  assertId(result.sourceKind, "The original posted source kind is invalid.")
  assertId(result.sourceId, "The original posted source identity is invalid.")
  assertId(result.target.kind, "The correction source target is invalid.")
  assertDate(result.posted.effectiveAt, "The posted source date is invalid.")
  assertText(
    result.posted.description,
    2_000,
    "The posted source description is invalid.",
  )
  assertRevision(
    result.posted.sequence,
    "The posted source sequence is invalid.",
  )
  assertSignedMinor(
    result.posted.amountMinor,
    "The posted source amount is invalid.",
  )

  switch (result.target.kind) {
    case "MONEY":
      assertId(result.target.entryId, "The money entry identity is invalid.")
      break
    case "BILL":
      assertId(result.target.billId, "The bill identity is invalid.")
      if (result.target.paymentId !== undefined)
        assertId(result.target.paymentId, "The payment identity is invalid.")
      break
    case "PURCHASE":
      assertId(result.target.billId, "The purchase bill identity is invalid.")
      if (result.target.paymentId !== undefined)
        assertId(
          result.target.paymentId,
          "The purchase payment identity is invalid.",
        )
      break
    case "SUPPLIER":
      assertId(result.target.supplierId, "The supplier identity is invalid.")
      assertId(
        result.target.supplierEntryId,
        "The supplier entry identity is invalid.",
      )
      break
    case "CUSTOMER":
      assertId(result.target.customerId, "The customer identity is invalid.")
      assertId(
        result.target.accountId,
        "The customer account identity is invalid.",
      )
      assertId(result.target.entryId, "The customer entry identity is invalid.")
      break
    case "UNAVAILABLE":
      assertText(
        result.target.reason,
        2_000,
        "The source explanation is invalid.",
      )
      break
  }
  return result
}
