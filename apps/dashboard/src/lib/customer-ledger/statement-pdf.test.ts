import { describe, expect, test } from "bun:test"
import { localDay, pdfBytes, statementPdfRange } from "./statement-pdf"

describe("statement PDF dates", () => {
  const today = new Date(2026, 10, 3, 15, 30)

  test("presets cover whole local days", () => {
    expect(localDay(today)).toBe("2026-11-03")
    expect(statementPdfRange("thisMonth", today)).toEqual({
      from: "2026-11-01",
      through: "2026-11-03",
    })
    expect(statementPdfRange("lastMonth", today)).toEqual({
      from: "2026-10-01",
      through: "2026-10-31",
    })
    expect(statementPdfRange("last3Months", today)).toEqual({
      from: "2026-08-01",
      through: "2026-10-31",
    })
    expect(statementPdfRange("thisYear", today)).toEqual({
      from: "2026-01-01",
      through: "2026-11-03",
    })
  })

  test("last month crosses the year in January", () => {
    expect(statementPdfRange("lastMonth", new Date(2027, 0, 9))).toEqual({
      from: "2026-12-01",
      through: "2026-12-31",
    })
    expect(statementPdfRange("last3Months", new Date(2027, 1, 9))).toEqual({
      from: "2026-11-01",
      through: "2027-01-31",
    })
  })

  test("decodes the PDF bytes", () => {
    expect(Array.from(pdfBytes(btoa("%PDF")))).toEqual([37, 80, 68, 70])
  })
})
