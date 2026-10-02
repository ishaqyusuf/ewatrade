import { describe, expect, test } from "bun:test"
import {
  prepareFinanceStatementRange,
  prepareMoneyCorrection,
  prepareMoneyMovement,
} from "./finance-money-input"

const movement = {
  bookId: "book",
  startsAt: "2026-10-01T00:00:00Z",
  kind: "TRANSFER" as const,
  accountId: "cash",
  destinationAccountId: "bank",
  activeAccountIds: ["cash", "bank"],
  amount: "12.34",
  description: " Bank deposit ",
  date: "2026-10-02",
}
const correction = {
  bookId: "book",
  entryId: "original",
  sourceKind: "TRANSFER",
  effectiveAt: "2026-10-02T15:30:00Z",
  reversed: false,
  reason: "Wrong account",
  date: "2026-10-02",
  now: new Date("2026-10-03T12:00:00Z"),
}
describe("mobile money command preparation", () => {
  test("keeps transfers exact and binds both accounts", () => {
    const result = prepareMoneyMovement(movement)
    expect(result.amountMinor).toBe("1234")
    expect(result.description).toBe("Bank deposit")
    expect(result).toHaveProperty("destinationAccountId", "bank")
    expect(result.effectiveAt.toISOString()).toBe("2026-10-02T00:00:00.000Z")
  })
  test("rejects same, missing or archived account selections", () => {
    expect(() =>
      prepareMoneyMovement({ ...movement, destinationAccountId: "cash" }),
    ).toThrow()
    expect(() =>
      prepareMoneyMovement({ ...movement, accountId: "foreign" }),
    ).toThrow()
    expect(() =>
      prepareMoneyMovement({ ...movement, activeAccountIds: ["cash"] }),
    ).toThrow()
  })
  test("funding and drawings do not retain a transfer destination", () => {
    for (const kind of ["OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"] as const) {
      const result = prepareMoneyMovement({ ...movement, kind })
      expect(result.kind).toBe(kind)
      expect(result).not.toHaveProperty("destinationAccountId")
    }
  })
  test("opening balance uses the exact book start, not the editable date", () => {
    const result = prepareMoneyMovement({
      ...movement,
      kind: "OPENING_BALANCE",
      startsAt: "2026-10-01T12:15:00Z",
      date: "invalid",
    })
    expect(result.effectiveAt.toISOString()).toBe("2026-10-01T12:15:00.000Z")
    expect(result).not.toHaveProperty("destinationAccountId")
  })
  test("rejects invalid calendar dates, inexact amounts and empty descriptions", () => {
    expect(() =>
      prepareMoneyMovement({ ...movement, date: "2026-09-30" }),
    ).toThrow()
    expect(() =>
      prepareMoneyMovement({ ...movement, date: "2026-02-30" }),
    ).toThrow()
    expect(() =>
      prepareMoneyMovement({ ...movement, amount: "0.001" }),
    ).toThrow()
    expect(() =>
      prepareMoneyMovement({ ...movement, description: " " }),
    ).toThrow()
  })
  test("same-day reversal retains the original timestamp and source ID", () => {
    const result = prepareMoneyCorrection(correction)
    expect(result.effectiveAt.toISOString()).toBe("2026-10-02T15:30:00.000Z")
    expect(result.entryId).toBe("original")
    expect(
      prepareMoneyCorrection({
        ...correction,
        date: "2026-10-03",
      }).effectiveAt.toISOString(),
    ).toBe("2026-10-03T00:00:00.000Z")
  })
  test("only unreversed originals, reasons and nonfuture dates can be reviewed", () => {
    expect(() =>
      prepareMoneyCorrection({ ...correction, sourceKind: "OPENING_BALANCE" }),
    ).toThrow()
    expect(() =>
      prepareMoneyCorrection({ ...correction, reversed: true }),
    ).toThrow()
    expect(() =>
      prepareMoneyCorrection({ ...correction, reason: " " }),
    ).toThrow()
    expect(() =>
      prepareMoneyCorrection({ ...correction, date: "2026-10-01" }),
    ).toThrow()
    expect(() =>
      prepareMoneyCorrection({ ...correction, date: "2026-10-04" }),
    ).toThrow()
  })
  test("statement includes book-start time and complete through-day without rollover", () => {
    const result = prepareFinanceStatementRange(
      "2026-10-01",
      "2026-10-02",
      "2026-10-01T12:15:00Z",
    )
    expect(result.from.toISOString()).toBe("2026-10-01T12:15:00.000Z")
    expect(result.through.toISOString()).toBe("2026-10-02T23:59:59.999Z")
    expect(() =>
      prepareFinanceStatementRange(
        "2026-09-30",
        "2026-10-02",
        movement.startsAt,
      ),
    ).toThrow()
    expect(() =>
      prepareFinanceStatementRange(
        "2026-10-02",
        "2026-10-01",
        movement.startsAt,
      ),
    ).toThrow()
    expect(() =>
      prepareFinanceStatementRange(
        "2026-10-01",
        "2026-02-30",
        movement.startsAt,
      ),
    ).toThrow()
  })
})
