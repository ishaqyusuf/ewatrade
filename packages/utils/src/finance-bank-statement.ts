import { parseFinanceMoney } from "./finance-money"
const MAX_FINANCE_AMOUNT = 100_000_000_000_000n

export class FinanceBankStatementCsvError extends Error {
  constructor(
    public readonly code: "INVALID_JOURNAL" | "INVALID_AMOUNT",
    message: string,
  ) {
    super(message)
    this.name = "FinanceBankStatementCsvError"
  }
}

export const FINANCE_BANK_STATEMENT_MAX_ROWS = 500
export const FINANCE_BANK_STATEMENT_MAX_CSV_BYTES = 524_288

const MAX_COLUMNS = 30
const MAX_CELL_CHARS = 2_000
const MAX_TRANSACTION_ID_CHARS = 128
const MAX_DESCRIPTION_CHARS = 500

export type FinanceBankStatementColumns = {
  transactionId: string
  date: string
  amount: string
  description: string
}

export type FinanceBankStatementCsvRow = Readonly<{
  externalId: string
  occurredAt: Date
  amountMinor: bigint
  description: string
}>

type CurrencyUnits = "MINOR" | "MAJOR"

function invalidCsv(message: string): never {
  throw new FinanceBankStatementCsvError(
    "INVALID_JOURNAL",
    `Statement CSV ${message}.`,
  )
}

function invalidAmount(message: string): never {
  throw new FinanceBankStatementCsvError(
    "INVALID_AMOUNT",
    `Statement CSV ${message}.`,
  )
}

function assertNoControls(
  value: string,
  allowNewlines: boolean,
  context: string,
) {
  const hasControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      codePoint !== undefined &&
      ((codePoint >= 0x7f && codePoint <= 0x9f) ||
        (codePoint < 0x20 && !(allowNewlines && codePoint === 0x0a)))
    )
  })
  if (hasControl)
    invalidCsv(`${context} contains unsupported control characters`)
}

function parseRecords(csv: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ""
  let inQuotes = false
  let afterQuote = false
  let recordStarted = false

  const append = (character: string) => {
    field += character
    if (field.length > MAX_CELL_CHARS)
      invalidCsv(`cell exceeds the ${MAX_CELL_CHARS}-character limit`)
  }

  const appendCell = () => {
    if (record.length >= MAX_COLUMNS)
      invalidCsv(`has more than ${MAX_COLUMNS} columns`)
    record.push(field)
    field = ""
    afterQuote = false
  }

  const appendRecord = () => {
    appendCell()
    records.push(record)
    if (records.length > FINANCE_BANK_STATEMENT_MAX_ROWS + 1)
      invalidCsv(`has more than ${FINANCE_BANK_STATEMENT_MAX_ROWS} data rows`)
    record = []
    recordStarted = false
  }

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (character === undefined) continue

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          append('"')
          index += 1
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else if (character === "\r") {
        if (csv[index + 1] !== "\n")
          invalidCsv("contains a bare carriage return inside a quoted cell")
        append("\n")
        index += 1
      } else {
        append(character)
      }
      continue
    }

    if (afterQuote) {
      if (character === ",") {
        appendCell()
        recordStarted = true
      } else if (character === "\n") {
        appendRecord()
      } else if (character === "\r") {
        if (csv[index + 1] !== "\n")
          invalidCsv("contains a bare carriage return between rows")
        appendRecord()
        index += 1
      } else {
        invalidCsv("contains characters after a closing quote")
      }
      continue
    }

    if (character === '"') {
      if (field.length !== 0)
        invalidCsv("contains a quote inside an unquoted cell")
      inQuotes = true
      recordStarted = true
    } else if (character === ",") {
      appendCell()
      recordStarted = true
    } else if (character === "\n") {
      appendRecord()
    } else if (character === "\r") {
      if (csv[index + 1] !== "\n")
        invalidCsv("contains a bare carriage return between rows")
      appendRecord()
      index += 1
    } else {
      append(character)
      recordStarted = true
    }
  }

  if (inQuotes) invalidCsv("has an unterminated quoted cell")
  if (recordStarted || record.length > 0 || field.length > 0 || afterQuote)
    appendRecord()
  if (records.length === 0) invalidCsv("is empty")
  return records
}

function parseDate(value: string, rowNumber: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match?.[1] || !match[2] || !match[3])
    invalidCsv(`row ${rowNumber} date must use YYYY-MM-DD`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31)
    invalidCsv(`row ${rowNumber} has an invalid calendar date`)
  const occurredAt = new Date(0)
  occurredAt.setUTCFullYear(year, month - 1, day)
  occurredAt.setUTCHours(0, 0, 0, 0)
  if (
    occurredAt.getUTCFullYear() !== year ||
    occurredAt.getUTCMonth() !== month - 1 ||
    occurredAt.getUTCDate() !== day
  )
    invalidCsv(`row ${rowNumber} has an invalid calendar date`)
  return occurredAt
}

function parseMinorAmount(value: string, rowNumber: number): bigint {
  if (!/^-?(0|[1-9]\d*)$/.test(value))
    invalidAmount(
      `row ${rowNumber} amount must be a canonical whole minor-unit value`,
    )
  const amount = BigInt(value)
  if (amount === BigInt(0))
    invalidAmount(`row ${rowNumber} amount must not be zero`)
  if (amount < -MAX_FINANCE_AMOUNT || amount > MAX_FINANCE_AMOUNT)
    invalidAmount(`row ${rowNumber} amount exceeds the transaction limit`)
  return amount
}

function parseMajorAmount(value: string, rowNumber: number): bigint {
  if (!/^-?(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))
    invalidAmount(
      `row ${rowNumber} amount must use canonical signed decimal units`,
    )
  const negative = value.startsWith("-")
  const magnitudeText = negative ? value.slice(1) : value
  try {
    const magnitude = BigInt(parseFinanceMoney(magnitudeText))
    return negative ? -magnitude : magnitude
  } catch {
    invalidAmount(
      `row ${rowNumber} amount must use exact decimal units with up to two decimal places and stay within the transaction limit`,
    )
  }
}

/** Parse a bounded comma-separated bank statement without lossy amount conversion. */
export function parseFinanceBankStatementCsv(
  csv: string,
  columns: FinanceBankStatementColumns,
  units: CurrencyUnits,
): readonly FinanceBankStatementCsvRow[] {
  if (
    new TextEncoder().encode(csv).byteLength >
    FINANCE_BANK_STATEMENT_MAX_CSV_BYTES
  )
    invalidCsv(`exceeds the ${FINANCE_BANK_STATEMENT_MAX_CSV_BYTES}-byte limit`)
  if (units !== "MINOR" && units !== "MAJOR")
    invalidCsv("amount units must be MINOR or MAJOR")

  const normalizedCsv = csv.startsWith("\uFEFF") ? csv.slice(1) : csv
  const records = parseRecords(normalizedCsv)
  const rawHeaders = records[0]
  if (!rawHeaders) invalidCsv("is missing its header row")
  const headers = rawHeaders.map((header, index) => {
    assertNoControls(header, false, `header ${index + 1}`)
    return header.trim()
  })
  if (headers.some((header) => header.length === 0))
    invalidCsv("contains an empty header")
  if (new Set(headers).size !== headers.length)
    invalidCsv("contains duplicate headers after trimming whitespace")

  const mappedHeaders = {
    transactionId: columns.transactionId.trim(),
    date: columns.date.trim(),
    amount: columns.amount.trim(),
    description: columns.description.trim(),
  }
  const mappedNames = Object.values(mappedHeaders)
  if (mappedNames.some((header) => header.length === 0))
    invalidCsv(
      "requires a header mapping for transaction ID, date, amount and description",
    )
  if (new Set(mappedNames).size !== mappedNames.length)
    invalidCsv("has colliding header mappings; choose four distinct columns")
  const indexByField = {
    transactionId: headers.indexOf(mappedHeaders.transactionId),
    date: headers.indexOf(mappedHeaders.date),
    amount: headers.indexOf(mappedHeaders.amount),
    description: headers.indexOf(mappedHeaders.description),
  }
  const missingMapping = Object.entries(indexByField).find(
    ([, index]) => index < 0,
  )
  if (missingMapping) {
    const fieldName = missingMapping[0] as keyof typeof mappedHeaders
    invalidCsv(
      `is missing the mapped ${missingMapping[0]} header "${mappedHeaders[fieldName]}"`,
    )
  }

  const dataRows = records.slice(1)
  if (dataRows.length > FINANCE_BANK_STATEMENT_MAX_ROWS)
    invalidCsv(`has more than ${FINANCE_BANK_STATEMENT_MAX_ROWS} data rows`)
  const seenIds = new Set<string>()
  const rows = dataRows.map((cells, index) => {
    const rowNumber = index + 2
    if (cells.length !== headers.length)
      invalidCsv(
        `row ${rowNumber} has ${cells.length} cells; expected ${headers.length}`,
      )
    const descriptionIndex = indexByField.description
    for (const [cellIndex, cell] of cells.entries())
      assertNoControls(
        cell,
        cellIndex === descriptionIndex,
        `row ${rowNumber}, column ${headers[cellIndex] ?? cellIndex + 1}`,
      )

    const externalId = (cells[indexByField.transactionId] ?? "").trim()
    const dateText = (cells[indexByField.date] ?? "").trim()
    const amountText = (cells[indexByField.amount] ?? "").trim()
    const description = (cells[indexByField.description] ?? "")
      .replace(/\r\n/g, "\n")
      .trim()
    if (externalId.length === 0)
      invalidCsv(`row ${rowNumber} has an empty transaction ID`)
    if (externalId.length > MAX_TRANSACTION_ID_CHARS)
      invalidCsv(
        `row ${rowNumber} transaction ID exceeds ${MAX_TRANSACTION_ID_CHARS} characters`,
      )
    if (seenIds.has(externalId))
      invalidCsv(`row ${rowNumber} repeats transaction ID "${externalId}"`)
    seenIds.add(externalId)
    if (description.length > MAX_DESCRIPTION_CHARS)
      invalidCsv(
        `row ${rowNumber} description exceeds ${MAX_DESCRIPTION_CHARS} characters`,
      )
    const amountMinor =
      units === "MINOR"
        ? parseMinorAmount(amountText, rowNumber)
        : parseMajorAmount(amountText, rowNumber)
    return Object.freeze({
      externalId,
      occurredAt: parseDate(dateText, rowNumber),
      amountMinor,
      description,
    })
  })
  return Object.freeze(rows)
}

/** Inspect headers using the same quoting, shape and size bounds as import. */
export function financeBankStatementCsvHeaders(csv: string): readonly string[] {
  if (
    new TextEncoder().encode(csv).byteLength >
    FINANCE_BANK_STATEMENT_MAX_CSV_BYTES
  )
    invalidCsv(`exceeds the ${FINANCE_BANK_STATEMENT_MAX_CSV_BYTES}-byte limit`)
  const records = parseRecords(csv.startsWith("\uFEFF") ? csv.slice(1) : csv)
  const headers = records[0]?.map((header, index) => {
    assertNoControls(header, false, `header ${index + 1}`)
    return header.trim()
  })
  if (!headers?.length || headers.some((header) => !header))
    invalidCsv("contains an empty header")
  if (new Set(headers).size !== headers.length)
    invalidCsv("contains duplicate headers after trimming whitespace")
  return Object.freeze(headers)
}

export function parseFinanceBankBalance(value: string): string {
  const text = value.trim()
  const match = /^(-?)(0|[1-9]\d{0,16})(?:\.(\d{1,2}))?$/.exec(text)
  if (!match?.[2])
    throw new Error("Enter a signed balance with up to two decimal places.")
  const absolute =
    BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"))
  const amount = match[1] === "-" ? -absolute : absolute
  if (amount < -9223372036854775808n || amount > 9223372036854775807n)
    throw new Error("The balance exceeds the supported range.")
  return amount.toString()
}

export function financeBankStatementDate(value: string, end = false): Date {
  const date = parseDate(value, 1)
  if (end) date.setUTCHours(23, 59, 59, 999)
  return date
}
