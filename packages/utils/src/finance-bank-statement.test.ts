import { describe, expect, test } from "bun:test"
import {
  financeBankStatementCsvHeaders,
  financeBankStatementDate,
  parseFinanceBankBalance,
} from "./finance-bank-statement"
import { isFinanceCommandRecoveryMetadata } from "./finance-command-identity"

describe("bank statement client boundaries", () => {
  test("header inspection retains bounded CSV quoting and rejects ambiguous mapping", () => {
    expect(
      financeBankStatementCsvHeaders(
        '\uFEFF"Bank, ID",Date,Amount,Description\r\nA,2026-09-01,1.00,"North, branch"',
      ),
    ).toEqual(["Bank, ID", "Date", "Amount", "Description"])
    expect(() => financeBankStatementCsvHeaders(" ID ,ID,Date,Amount")).toThrow(
      "duplicate headers",
    )
    expect(() =>
      financeBankStatementCsvHeaders(
        'ID,Date,Amount,Description\nA,2026-09-01,1.00,"Unfinished',
      ),
    ).toThrow()
  })
  test("signed original balances preserve zero, negative cents and int64 endpoints", () => {
    expect(parseFinanceBankBalance("-0.01")).toBe("-1")
    expect(parseFinanceBankBalance("-0.00")).toBe("0")
    expect(parseFinanceBankBalance("92233720368547758.07")).toBe(
      "9223372036854775807",
    )
    expect(parseFinanceBankBalance("-92233720368547758.08")).toBe(
      "-9223372036854775808",
    )
    for (const value of [
      "92233720368547758.08",
      "-92233720368547758.09",
      "- 1.00",
      "01.00",
      "1e2",
      "1,000.00",
      "1.001",
    ])
      expect(() => parseFinanceBankBalance(value)).toThrow()
  })
  test("statement dates keep true calendar boundaries and complete UTC cutoffs", () => {
    expect(financeBankStatementDate("2024-02-29").toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    )
    expect(financeBankStatementDate("2024-02-29", true).toISOString()).toBe(
      "2024-02-29T23:59:59.999Z",
    )
    expect(() => financeBankStatementDate("2023-02-29")).toThrow()
    expect(() => financeBankStatementDate("2026-9-1")).toThrow()
  })
  test("restart metadata accepts original revision only, never statement content", () => {
    expect(
      isFinanceCommandRecoveryMetadata({
        accountId: "bank",
        expectedBankRevision: "0",
      }),
    ).toBe(true)
    expect(
      isFinanceCommandRecoveryMetadata({
        expectedBankRevision: "9223372036854775807",
      }),
    ).toBe(true)
    for (const value of ["01", "-1", "1.0", "9223372036854775808", 1])
      expect(
        isFinanceCommandRecoveryMetadata({ expectedBankRevision: value }),
      ).toBe(false)
    expect(
      isFinanceCommandRecoveryMetadata({
        expectedBankRevision: "1",
        csv: "original private statement",
      }),
    ).toBe(false)
    expect(
      isFinanceCommandRecoveryMetadata({
        expectedBankRevision: "1",
        openingBalanceMinor: "123",
      }),
    ).toBe(false)
  })
})
