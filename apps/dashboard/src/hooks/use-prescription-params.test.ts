import { describe, expect, test } from "bun:test"

import { prescriptionSheetModeForStatus } from "./use-prescription-params"

describe("Prescription sheet routing", () => {
  test("routes each actionable lifecycle state to an explicit sheet mode", () => {
    expect(prescriptionSheetModeForStatus("media_review")).toBe("media-review")
    expect(prescriptionSheetModeForStatus("attendant_verification")).toBe(
      "attendant-review",
    )
    expect(prescriptionSheetModeForStatus("pharmacist_review")).toBe(
      "pharmacist-review",
    )
    expect(prescriptionSheetModeForStatus("ready_to_quote")).toBe("quote")
    expect(prescriptionSheetModeForStatus("converted")).toBe("details")
  })

  test("keeps a newly created attendant request in the review controller", () => {
    const createdRequest = { status: "ATTENDANT_VERIFICATION" }

    expect(prescriptionSheetModeForStatus(createdRequest.status)).toBe(
      "attendant-review",
    )
  })
})
