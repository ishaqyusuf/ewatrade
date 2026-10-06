import { describe, expect, test } from "bun:test"
import {
  FINANCE_BANK_STATEMENT_MAX_CSV_BYTES,
  FINANCE_BANK_STATEMENT_MAX_ROWS,
  type FinanceBankStatementColumns,
  parseFinanceBankStatementCsv,
} from "./bank-statement-csv"
import { FinanceError, MAX_FINANCE_AMOUNT } from "./rules"

const columns: FinanceBankStatementColumns = {
  transactionId: "Reference",
  date: "Date",
  amount: "Amount",
  description: "Narration",
}

function parse(csv: string, units: "MINOR" | "MAJOR" = "MAJOR") {
  return parseFinanceBankStatementCsv(csv, columns, units)
}

function expectFinanceError(
  action: () => unknown,
  code: FinanceError["code"],
  message?: string,
) {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }
  if (!caught) throw new Error("Expected a FinanceError")
  expect(caught).toBeInstanceOf(FinanceError)
  expect(caught).toMatchObject({ code })
  if (message) expect((caught as Error).message).toContain(message)
}

function statement(rows: string[], header = "Reference,Date,Amount,Narration") {
  return [header, ...rows].join("\n")
}

describe("parseFinanceBankStatementCsv", () => {
  test("accepts a valid headers-only file as a zero-movement statement", () => {
    expect(parse("Reference,Date,Amount,Narration")).toEqual([])
    expectFinanceError(() => parse(""), "INVALID_JOURNAL", "is empty")
  })

  test("maps trimmed headers and parses escaped quotes and quoted newlines", () => {
    const result = parse(
      "\uFEFF Reference ,Date,Amount,Narration,Unused\r\n" +
        '" txn-1 ", 2024-02-29 , 12.3 ,"  Cafe, ""North""\r\nbranch  ",ignored\r\n' +
        "txn-2,2024-03-01,-0.01,Refund,anything\r\n",
    )

    expect(result).toEqual([
      {
        externalId: "txn-1",
        occurredAt: new Date("2024-02-29T00:00:00.000Z"),
        amountMinor: 1230n,
        description: 'Cafe, "North"\nbranch',
      },
      {
        externalId: "txn-2",
        occurredAt: new Date("2024-03-01T00:00:00.000Z"),
        amountMinor: -1n,
        description: "Refund",
      },
    ])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result[0])).toBe(true)
  })

  test("keeps large positive and negative major values exact and bounded", () => {
    const result = parse(
      statement([
        "large,2025-01-01,999999999999.99,Large transfer",
        "limit,2025-01-02,-1000000000000.00,Maximum refund",
      ]),
    )

    expect(result.map((row) => row.amountMinor)).toEqual([
      99999999999999n,
      -MAX_FINANCE_AMOUNT,
    ])
    expect(
      parse(statement(["refund,2025-01-03,-0.01,Refund"]))[0]?.amountMinor,
    ).toBe(-1n)
  })

  test("parses canonical signed minor values without accepting decimal syntax", () => {
    const result = parse(
      statement([
        "positive,2025-01-01,100000000000000,Deposit",
        "negative,2025-01-02,-99999999999999,Withdrawal",
      ]),
      "MINOR",
    )

    expect(result.map((row) => row.amountMinor)).toEqual([
      MAX_FINANCE_AMOUNT,
      -99999999999999n,
    ])
    expect(() =>
      parse(statement(["bad,2025-01-01,1.00,Decimal"]), "MINOR"),
    ).toThrow(FinanceError)
  })

  test("rejects invalid dates, noncanonical values, zero and values beyond the limit", () => {
    for (const date of ["2023-02-29", "1900-02-29", "2024-13-01"])
      expectFinanceError(
        () => parse(statement([`date,${date},1,Deposit`])),
        "INVALID_JOURNAL",
      )
    expectFinanceError(
      () => parse(statement(["date,2024-02-29T00:00:00Z,1.00,Deposit"])),
      "INVALID_JOURNAL",
      "YYYY-MM-DD",
    )
    for (const amount of [
      "0",
      "-0",
      "0.00",
      "01.00",
      "+1.00",
      "- 1.00",
      "1.001",
      "1e3",
      '"1,000.00"',
      "1000000000000.01",
    ]) {
      const action = () =>
        parse(statement([`amount,2024-01-01,${amount},Transfer`]))
      expectFinanceError(action, "INVALID_AMOUNT")
    }
    expectFinanceError(
      () =>
        parse(
          statement(["too-large,2024-01-01,100000000000001,Transfer"]),
          "MINOR",
        ),
      "INVALID_AMOUNT",
      "transaction limit",
    )
  })

  test("rejects duplicate IDs, missing or colliding mappings and duplicate headers", () => {
    const maximumId = "x".repeat(128)
    const maximumIdRow = [maximumId, "2024-01-01", "1.00", "Boundary"].join(",")
    expect(parse(statement([maximumIdRow]))[0]?.externalId).toHaveLength(128)
    const longIdRow = ["x".repeat(129), "2024-01-01", "1.00", "Boundary"].join(
      ",",
    )
    expectFinanceError(
      () => parse(statement([longIdRow])),
      "INVALID_JOURNAL",
      "transaction ID exceeds 128",
    )
    expectFinanceError(
      () =>
        parse(
          statement([
            "duplicate,2024-01-01,1.00,Deposit",
            " duplicate ,2024-01-02,2.00,Deposit",
          ]),
        ),
      "INVALID_JOURNAL",
      "repeats transaction ID",
    )
    expectFinanceError(
      () =>
        parse("Reference,Date,Amount,Memo\nx,2024-01-01,1.00,test", "MAJOR"),
      "INVALID_JOURNAL",
      "missing the mapped description header",
    )
    expectFinanceError(
      () =>
        parseFinanceBankStatementCsv(
          statement(["x,2024-01-01,1.00,test"]),
          { ...columns, description: "Date" },
          "MAJOR",
        ),
      "INVALID_JOURNAL",
      "colliding header mappings",
    )
    expectFinanceError(
      () => parse("Reference,Date, Date ,Narration\nx,2024-01-01,1.00,test"),
      "INVALID_JOURNAL",
      "duplicate headers",
    )
  })

  test("rejects malformed quoting, row shapes and control characters", () => {
    for (const csv of [
      statement(['x,2024-01-01,1.00,"unterminated']),
      statement(['x,2024-01-01,1.00,un"escaped']),
      statement(['x,2024-01-01,1.00,"quoted" trailing']),
      statement(["x,2024-01-01,1.00"]),
      statement(["x,2024-01-01,1.00,deposit\u0000"]),
      statement(["x,2024-01-01,1.00,deposit\ttext"]),
      statement(["x,2024-01-01,1.00,deposit\u0085text"]),
    ])
      expectFinanceError(() => parse(csv), "INVALID_JOURNAL")
  })

  test("enforces all documented parser bounds without truncating input", () => {
    const tooManyRows = Array.from(
      { length: FINANCE_BANK_STATEMENT_MAX_ROWS + 1 },
      (_, index) => `id-${index},2024-01-01,1.00,x`,
    )
    expectFinanceError(
      () => parse(statement(tooManyRows)),
      "INVALID_JOURNAL",
      `more than ${FINANCE_BANK_STATEMENT_MAX_ROWS} data rows`,
    )
    expectFinanceError(
      () => parse(statement([`x,2024-01-01,1.00,${"d".repeat(501)}`])),
      "INVALID_JOURNAL",
      "description exceeds 500",
    )
    expectFinanceError(
      () => parse(statement([`x,2024-01-01,1.00,${"d".repeat(2_001)}`])),
      "INVALID_JOURNAL",
      "cell exceeds the 2000-character limit",
    )
    expectFinanceError(
      () =>
        parse(
          `A,${Array.from({ length: 30 }, (_, index) => `C${index}`).join(",")}`,
        ),
      "INVALID_JOURNAL",
      "more than 30 columns",
    )
    expectFinanceError(
      () => parse("x".repeat(FINANCE_BANK_STATEMENT_MAX_CSV_BYTES + 1)),
      "INVALID_JOURNAL",
      "byte limit",
    )
    expectFinanceError(
      () => parse("é".repeat(FINANCE_BANK_STATEMENT_MAX_CSV_BYTES / 2 + 1)),
      "INVALID_JOURNAL",
      "byte limit",
    )
  })
})
