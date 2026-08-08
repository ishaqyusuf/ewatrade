import { describe, expect, test } from "bun:test"
import { prescriptionStaffIntakeFormSchema } from "./schemas"

describe("Prescription form schemas", () => {
  test("allows an empty manual draft for media-only staff intake", () => {
    expect(
      prescriptionStaffIntakeFormSchema.parse({
        consentAccepted: true,
        consentVersion: "2026-08-09",
        customerEmail: "customer@example.com",
        customerName: "",
        customerPhone: "",
        fulfilmentPreference: "pickup",
        manualIntakeText: "",
        source: "staff_walk_in",
      }),
    ).toMatchObject({ manualIntakeText: "" })
  })
})
