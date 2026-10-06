import {
  FINANCE_BANK_STATEMENT_MAX_CSV_BYTES,
  type FinanceBankStatementColumns,
  type FinanceBankStatementCsvRow,
  financeBankStatementDate,
  parseFinanceBankBalance,
  parseFinanceBankStatementCsv,
} from "@ewatrade/utils/finance-bank-statement"

const MAX_ID_LENGTH = 128
const MAX_REVISION = 9_223_372_036_854_775_807n

export type NativeFinanceBankImportBook = {
  id: string
  currencyCode: string
  startsAt: Date | string
}

export type NativeFinanceBankImportAccount = {
  id: string
  bookId: string
  kind: string
  purpose: string
  archivedAt: Date | string | null
}

export type NativeFinanceBankImportSource = {
  book: NativeFinanceBankImportBook
  account: NativeFinanceBankImportAccount
  bankRevision: string
}

export type NativeFinanceBankStatementImportPreview = {
  bookId: string
  accountId: string
  currencyCode: string
  expectedRevision: string
  reference: string
  startsAt: Date
  endsAt: Date
  openingBalanceMinor: string
  closingBalanceMinor: string
  transactionTotalMinor: string
  csv: string
  columns: FinanceBankStatementColumns
  units: "MINOR" | "MAJOR"
  rows: readonly FinanceBankStatementCsvRow[]
}

/** Mirrors the strict finance.bankStatements.import input. */
export type NativeFinanceBankStatementImportPayload = {
  bookId: string
  accountId: string
  clientCommandId: string
  expectedRevision: string
  currencyCode: string
  reference: string
  startsAt: Date
  endsAt: Date
  openingBalanceMinor: string
  closingBalanceMinor: string
  csv: string
  columns: FinanceBankStatementColumns
  units: "MINOR" | "MAJOR"
}

function assertId(value: string, label: string) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > MAX_ID_LENGTH
  )
    throw new Error(`${label} could not be confirmed.`)
}

function assertUsableBankSource(
  source: NativeFinanceBankImportSource,
  selectedAccountId?: string,
) {
  const { book, account, bankRevision } = source
  assertId(book.id, "The finance book")
  assertId(account.id, "The bank account")
  assertId(account.bookId, "The bank account book")
  if (selectedAccountId !== undefined && account.id !== selectedAccountId)
    throw new Error("Choose the original bank account for this statement.")
  if (
    account.bookId !== book.id ||
    account.kind !== "ASSET" ||
    !["BANK", "CLEARING"].includes(account.purpose) ||
    account.archivedAt !== null
  )
    throw new Error("Choose an active bank or clearing account in this book.")
  if (!/^[A-Z]{3}$/.test(book.currencyCode))
    throw new Error("The finance book currency could not be confirmed.")
  if (!/^(0|[1-9]\d{0,18})$/.test(bankRevision))
    throw new Error("The bank evidence revision could not be confirmed.")
  if (BigInt(bankRevision) > MAX_REVISION)
    throw new Error("The bank evidence revision exceeds the supported range.")
  const startsAt = new Date(book.startsAt)
  if (!Number.isFinite(startsAt.getTime()))
    throw new Error("The finance book start date could not be confirmed.")
  return startsAt
}

/** Decode strict UTF-8 without relying on TextDecoder fatal-mode support in Hermes. */
export function decodeNativeFinanceBankStatementCsv(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
    throw new Error("Choose a non-empty CSV statement.")
  if (bytes.byteLength > FINANCE_BANK_STATEMENT_MAX_CSV_BYTES)
    throw new Error("CSV statements must be 512 KiB or smaller.")

  const codeUnits: number[] = []
  const pieces: string[] = []
  let codeUnitCount = 0
  const append = (codePoint: number) => {
    if (codePoint <= 0xffff) {
      codeUnits.push(codePoint)
      codeUnitCount += 1
    } else {
      const supplementary = codePoint - 0x10000
      codeUnits.push(0xd800 + (supplementary >> 10))
      codeUnits.push(0xdc00 + (supplementary & 0x3ff))
      codeUnitCount += 2
    }
    if (codeUnits.length >= 8192)
      pieces.push(String.fromCharCode(...codeUnits.splice(0)))
  }

  try {
    for (let index = 0; index < bytes.length; ) {
      const first = bytes[index]
      if (first === undefined) throw new Error("Invalid UTF-8")
      if (first <= 0x7f) {
        append(first)
        index += 1
        continue
      }

      let width: number
      let codePoint: number
      if (first >= 0xc2 && first <= 0xdf) {
        width = 2
        codePoint = first & 0x1f
      } else if (first >= 0xe0 && first <= 0xef) {
        width = 3
        codePoint = first & 0x0f
      } else if (first >= 0xf0 && first <= 0xf4) {
        width = 4
        codePoint = first & 0x07
      } else {
        throw new Error("Invalid UTF-8")
      }

      if (index + width > bytes.length) throw new Error("Invalid UTF-8")
      const second = bytes[index + 1]
      if (
        second === undefined ||
        second < 0x80 ||
        second > 0xbf ||
        (first === 0xe0 && second < 0xa0) ||
        (first === 0xed && second > 0x9f) ||
        (first === 0xf0 && second < 0x90) ||
        (first === 0xf4 && second > 0x8f)
      )
        throw new Error("Invalid UTF-8")
      codePoint = (codePoint << 6) | (second & 0x3f)
      for (let offset = 2; offset < width; offset += 1) {
        const continuation = bytes[index + offset]
        if (
          continuation === undefined ||
          continuation < 0x80 ||
          continuation > 0xbf
        )
          throw new Error("Invalid UTF-8")
        codePoint = (codePoint << 6) | (continuation & 0x3f)
      }
      append(codePoint)
      index += width
    }
  } catch {
    throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 and retry.")
  }
  if (codeUnits.length) pieces.push(String.fromCharCode(...codeUnits))
  if (codeUnitCount === 0) throw new Error("Choose a non-empty CSV statement.")
  return pieces.join("")
}

export function prepareNativeFinanceBankStatementImportPreview(input: {
  source: NativeFinanceBankImportSource
  selectedAccountId: string
  bytes: Uint8Array
  columns: FinanceBankStatementColumns
  units: "MINOR" | "MAJOR"
  reference: string
  startsOn: string
  endsOn: string
  openingBalance: string
  closingBalance: string
  now?: Date
}): NativeFinanceBankStatementImportPreview {
  const bookStartsAt = assertUsableBankSource(
    input.source,
    input.selectedAccountId,
  )
  const reference = input.reference.trim()
  if (!reference || reference.length > 160)
    throw new Error("Enter a statement reference of up to 160 characters.")
  const csv = decodeNativeFinanceBankStatementCsv(input.bytes)
  const startsAt = financeBankStatementDate(input.startsOn)
  const endsAt = financeBankStatementDate(input.endsOn, true)
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime()))
    throw new Error("The current date could not be confirmed.")
  if (startsAt.getTime() < bookStartsAt.getTime())
    throw new Error("The statement starts before this finance book.")
  if (startsAt > endsAt)
    throw new Error(
      "The statement start date must be on or before its end date.",
    )
  if (endsAt >= now)
    throw new Error("Import a completed statement period ending before today.")

  const openingBalanceMinor = parseFinanceBankBalance(input.openingBalance)
  const closingBalanceMinor = parseFinanceBankBalance(input.closingBalance)
  for (const [field, header] of Object.entries(input.columns))
    assertId(header, `The mapped ${field} CSV header`)
  const rows = parseFinanceBankStatementCsv(csv, input.columns, input.units)
  if (rows.some((row) => row.occurredAt < startsAt || row.occurredAt > endsAt))
    throw new Error(
      "Every transaction date must fall within the statement range.",
    )
  const transactionTotal = rows.reduce((sum, row) => sum + row.amountMinor, 0n)
  if (
    BigInt(openingBalanceMinor) + transactionTotal !==
    BigInt(closingBalanceMinor)
  )
    throw new Error(
      "Opening balance plus transactions must equal closing balance.",
    )

  return {
    bookId: input.source.book.id,
    accountId: input.source.account.id,
    currencyCode: input.source.book.currencyCode,
    expectedRevision: input.source.bankRevision,
    reference,
    startsAt,
    endsAt,
    openingBalanceMinor,
    closingBalanceMinor,
    transactionTotalMinor: transactionTotal.toString(),
    csv,
    columns: { ...input.columns },
    units: input.units,
    rows,
  }
}

export function toNativeFinanceBankStatementImportPayload(input: {
  preview: NativeFinanceBankStatementImportPreview
  currentSource: NativeFinanceBankImportSource
  clientCommandId: string
}): NativeFinanceBankStatementImportPayload {
  const { preview, currentSource } = input
  assertUsableBankSource(currentSource, preview.accountId)
  if (
    currentSource.book.id !== preview.bookId ||
    currentSource.account.id !== preview.accountId ||
    currentSource.book.currencyCode !== preview.currencyCode ||
    currentSource.bankRevision !== preview.expectedRevision
  )
    throw new Error(
      "Bank evidence changed after review. Prepare a fresh import.",
    )
  assertId(input.clientCommandId, "The finance command identity")

  return {
    bookId: preview.bookId,
    accountId: preview.accountId,
    clientCommandId: input.clientCommandId,
    expectedRevision: preview.expectedRevision,
    currencyCode: preview.currencyCode,
    reference: preview.reference,
    startsAt: new Date(preview.startsAt.getTime()),
    endsAt: new Date(preview.endsAt.getTime()),
    openingBalanceMinor: preview.openingBalanceMinor,
    closingBalanceMinor: preview.closingBalanceMinor,
    csv: preview.csv,
    columns: { ...preview.columns },
    units: preview.units,
  } satisfies NativeFinanceBankStatementImportPayload
}
