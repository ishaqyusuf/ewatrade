import { describe, expect, test } from "bun:test"

import {
  publicServiceDetail,
  publicServiceDisplayName,
} from "./service-display"

describe("public service display", () => {
  test("removes repeated item, variant, and offering names", () => {
    expect(
      publicServiceDisplayName(
        "Strategy Consultation",
        "Strategy Consultation",
        "Strategy Consultation",
      ),
    ).toBe("Strategy Consultation")
    expect(
      publicServiceDetail(
        "Strategy Consultation",
        "Strategy Consultation",
        "Strategy Consultation",
      ),
    ).toBe("Standard service")
  })

  test("keeps distinct service options", () => {
    expect(publicServiceDisplayName("Agbada", "L", "Express")).toBe(
      "Agbada · L · Express",
    )
    expect(publicServiceDetail("Agbada", null, "Agbada · L")).toBe("L")
  })
})
