import { describe, expect, it } from "bun:test"
import {
  decodeFinanceBankStatementCsv,
  prepareFinanceBankStatementPreview,
} from "./bank-import-state"

const columns = {
  transactionId: "Transaction ID",
  date: "Date",
  amount: "Amount",
  description: "Description",
}

const bookStartsAt = new Date("2025-01-01T00:00:00.000Z")
const completedNow = new Date("2025-03-01T00:00:00.000Z")

describe("bank import review state", () => {
  it("decodes bounded UTF-8 and rejects malformed input", () => {
    expect(
      decodeFinanceBankStatementCsv(
        new TextEncoder().encode("Id,Date,Amount,Description").buffer,
      ),
    ).toBe("Id,Date,Amount,Description")
    expect(() =>
      decodeFinanceBankStatementCsv(new Uint8Array([0xc3]).buffer),
    ).toThrow("not valid UTF-8")
    expect(() =>
      decodeFinanceBankStatementCsv(new ArrayBuffer(524_289)),
    ).toThrow("512 KiB")
  })

  it("previews exact signed totals and allows an empty statement body", () => {
    const preview = prepareFinanceBankStatementPreview({
      csv: "Transaction ID,Date,Amount,Description\n1,2025-01-02,12.50,Deposit\n2,2025-01-03,-2.50,Fee",
      columns,
      units: "MAJOR",
      startsOn: "2025-01-01",
      endsOn: "2025-01-31",
      openingBalance: "10.00",
      closingBalance: "20.00",
      bookStartsAt,
      now: completedNow,
    })
    expect(preview.rows).toHaveLength(2)
    expect(preview.openingBalanceMinor).toBe("1000")
    expect(preview.transactionTotalMinor).toBe("1000")
    expect(preview.closingBalanceMinor).toBe("2000")
    expect(preview.startsAt.toISOString()).toBe("2025-01-01T00:00:00.000Z")
    expect(preview.endsAt.toISOString()).toBe("2025-01-31T23:59:59.999Z")

    const empty = prepareFinanceBankStatementPreview({
      csv: "Transaction ID,Date,Amount,Description",
      columns,
      units: "MINOR",
      startsOn: "2025-01-01",
      endsOn: "2025-01-31",
      openingBalance: "20.00",
      closingBalance: "20.00",
      bookStartsAt,
      now: completedNow,
    })
    expect(empty.rows).toHaveLength(0)
    expect(empty.transactionTotalMinor).toBe("0")
  })

  it("rejects an unreconciled balance and rows outside the chosen date range", () => {
    const base = {
      csv: "Transaction ID,Date,Amount,Description\n1,2025-01-02,10.00,Deposit",
      columns,
      units: "MAJOR" as const,
      startsOn: "2025-01-01",
      endsOn: "2025-01-31",
      openingBalance: "10.00",
      closingBalance: "19.99",
      bookStartsAt,
      now: completedNow,
    }
    expect(() => prepareFinanceBankStatementPreview(base)).toThrow(
      "must equal closing balance",
    )
    expect(() =>
      prepareFinanceBankStatementPreview({
        ...base,
        closingBalance: "20.00",
        startsOn: "2025-01-03",
      }),
    ).toThrow("within the statement range")
  })
})
