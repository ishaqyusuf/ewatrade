import { describe, expect, test } from "bun:test"
import { buildPrescriptionQuoteCommand } from "./quotes"

describe("buildPrescriptionQuoteCommand", () => {
  test("derives a partial quote and converts display prices to minor units", () => {
    const ids = ["quote-id", "version-id"]
    const result = buildPrescriptionQuoteCommand({
      createId: () => ids.shift() ?? "unexpected",
      lines: [
        { availability: "AVAILABLE", id: "line-1" },
        { availability: "UNAVAILABLE", id: "line-2" },
      ],
      now: new Date("2026-08-09T00:00:00.000Z"),
      prices: { "line-1": "12.50" },
      requestId: "request-1",
      storeId: "store-1",
    })

    expect(result.availabilityOutcome).toBe("partial")
    expect(result.lines).toEqual([
      { transcriptionLineId: "line-1", unitPriceMinor: 1250 },
      { transcriptionLineId: "line-2", unitPriceMinor: undefined },
    ])
    expect(result.expiresAt.toISOString()).toBe("2026-08-10T00:00:00.000Z")
  })
})
