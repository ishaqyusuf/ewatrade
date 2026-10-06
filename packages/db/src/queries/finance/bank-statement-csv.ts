import {
  type FinanceBankStatementColumns,
  FinanceBankStatementCsvError,
  parseFinanceBankStatementCsv as parseCsv,
} from "@ewatrade/utils/finance-bank-statement"
import { FinanceError } from "./rules"

export {
  FINANCE_BANK_STATEMENT_MAX_CSV_BYTES,
  FINANCE_BANK_STATEMENT_MAX_ROWS,
  type FinanceBankStatementColumns,
  type FinanceBankStatementCsvRow,
} from "@ewatrade/utils/finance-bank-statement"

export function parseFinanceBankStatementCsv(
  csv: string,
  columns: FinanceBankStatementColumns,
  units: "MINOR" | "MAJOR",
) {
  try {
    return parseCsv(csv, columns, units)
  } catch (error) {
    if (error instanceof FinanceBankStatementCsvError)
      throw new FinanceError(error.code, error.message)
    throw error
  }
}
