import {
  FINANCE_BANK_STATEMENT_MAX_CSV_BYTES,
  type FinanceBankStatementColumns,
  type FinanceBankStatementCsvRow,
  financeBankStatementDate,
  parseFinanceBankBalance,
  parseFinanceBankStatementCsv,
} from "@ewatrade/utils/finance-bank-statement"

export function decodeFinanceBankStatementCsv(bytes: ArrayBuffer) {
  if (bytes.byteLength === 0)
    throw new Error("Choose a non-empty CSV statement.")
  if (bytes.byteLength > FINANCE_BANK_STATEMENT_MAX_CSV_BYTES)
    throw new Error("CSV statements must be 512 KiB or smaller.")
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("This CSV is not valid UTF-8. Save it as UTF-8 and retry.")
  }
}

export type FinanceBankStatementPreview = {
  rows: readonly FinanceBankStatementCsvRow[]
  startsAt: Date
  endsAt: Date
  openingBalanceMinor: string
  closingBalanceMinor: string
  transactionTotalMinor: string
}

export function prepareFinanceBankStatementPreview(input: {
  csv: string
  columns: FinanceBankStatementColumns
  units: "MINOR" | "MAJOR"
  startsOn: string
  endsOn: string
  openingBalance: string
  closingBalance: string
  bookStartsAt: Date | string
  now?: Date
}): FinanceBankStatementPreview {
  const startsAt = financeBankStatementDate(input.startsOn)
  const endsAt = financeBankStatementDate(input.endsOn, true)
  const bookStartsAt =
    input.bookStartsAt instanceof Date
      ? new Date(input.bookStartsAt.getTime())
      : new Date(input.bookStartsAt)
  const now = input.now ?? new Date()
  if (!Number.isFinite(bookStartsAt.getTime()))
    throw new Error("The finance book start date could not be confirmed.")
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
  const rows = parseFinanceBankStatementCsv(
    input.csv,
    input.columns,
    input.units,
  )
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
    rows,
    startsAt,
    endsAt,
    openingBalanceMinor,
    closingBalanceMinor,
    transactionTotalMinor: transactionTotal.toString(),
  }
}
