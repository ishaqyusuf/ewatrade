import { describe, expect, test } from "bun:test"
import { customerStatementDayStart } from "./statement-document"

describe("customer statement dates", () => {
  test("starts a local day in the business time zone", () => {
    expect(
      customerStatementDayStart("2026-10-01", "Africa/Lagos").toISOString(),
    ).toBe("2026-09-30T23:00:00.000Z")
    expect(customerStatementDayStart("2026-10-01", "UTC").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    )
  })

  test("settles a daylight-saving change", () => {
    // London moves to BST at 01:00 UTC on 29 March 2026.
    expect(
      customerStatementDayStart("2026-03-30", "Europe/London").toISOString(),
    ).toBe("2026-03-29T23:00:00.000Z")
  })

  test("refuses impossible dates and unknown zones", () => {
    expect(() => customerStatementDayStart("2026-02-30", "UTC")).toThrow()
    expect(() => customerStatementDayStart("2026-1-01", "UTC")).toThrow()
    expect(() =>
      customerStatementDayStart("2026-10-01", "Mars/Olympus"),
    ).toThrow()
  })
})
