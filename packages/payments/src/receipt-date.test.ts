import { expect, test } from "bun:test"
import { type ReceiptDateInput, checkManualReceiptDate } from "./receipt-date"
const policy = {
  oldestAcceptableAt: new Date("2026-10-20T10:00:00Z"),
  latestAcceptableAt: new Date("2026-10-27T10:15:00Z"),
}
const day = (dateOnly: string): ReceiptDateInput => ({
  dateOnly,
  dateTimeIso: null,
  dateRaw: dateOnly,
  dateAmbiguous: false,
})
test("date-only evidence flags definitely old/future days without assigning a timezone or instant", () => {
  expect(checkManualReceiptDate(day("2026-09-03"), policy)).toBe("old")
  expect(checkManualReceiptDate(day("2026-11-03"), policy)).toBe("future")
  expect(checkManualReceiptDate(day("2026-10-24"), policy)).toBe(
    "within_window",
  )
  expect(checkManualReceiptDate(day("2026-10-27"), policy)).toBe("unknown")
  expect(checkManualReceiptDate(day("2026-10-20"), policy)).toBe("unknown")
})
test("rollover dates, invalid leap days/times and ambiguous numeric dates never become valid timestamps", () => {
  for (const dateOnly of [
    "2026-02-31",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
  ]) {
    expect(checkManualReceiptDate(day(dateOnly), policy)).toBe("unknown")
    expect(
      checkManualReceiptDate(
        { ...day(dateOnly), dateTimeIso: `${dateOnly}T10:00:00Z` },
        policy,
      ),
    ).toBe("unknown")
  }
  expect(
    checkManualReceiptDate(
      { ...day("2026-10-24"), dateRaw: "03/09/2026" },
      policy,
    ),
  ).toBe("ambiguous")
  for (const dateTimeIso of [
    "2026-10-24T24:00:00Z",
    "2026-10-24T10:00:60Z",
    "2026-10-24T10:00:00+14:30",
    "2026-10-24T10:00:00",
  ])
    expect(
      checkManualReceiptDate({ ...day("2026-10-24"), dateTimeIso }, policy),
    ).toBe("unknown")
})
test("valid leap dates and explicit offset instants compare against policy bounds", () => {
  expect(checkManualReceiptDate(day("2024-02-29"), policy)).toBe("old")
  expect(
    checkManualReceiptDate(
      { ...day("2026-10-27"), dateTimeIso: "2026-10-27T11:00:00+01:00" },
      policy,
    ),
  ).toBe("within_window")
})
