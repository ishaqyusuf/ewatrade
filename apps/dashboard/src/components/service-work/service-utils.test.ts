import { describe, expect, test } from "bun:test"

import { catalogOfferingDisplayName } from "./service-utils"
import { formatDue } from "./service-utils"

describe("catalogOfferingDisplayName", () => {
  test("removes repeated item and variant segments", () => {
    expect(catalogOfferingDisplayName("Suit", "Suit · SM", "Suit · SM")).toBe(
      "Suit · SM",
    )
  })

  test("keeps distinct generic service segments", () => {
    expect(
      catalogOfferingDisplayName(
        "Business advisory",
        "Standard",
        "Consultation",
      ),
    ).toBe("Business advisory · Standard · Consultation")
  })
})

describe("formatDue", () => {
  test("uses the tenant timezone consistently", () => {
    expect(formatDue("2026-07-21T14:43:00.000Z", "Africa/Lagos")).toContain(
      "15:43",
    )
  })
})
