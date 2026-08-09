import { describe, expect, test } from "bun:test"
import {
  prescriptionStaffIntakeFormSchema,
  prescriptionStoreSettingsFormSchema,
} from "./schemas"

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

  test("normalizes empty disabled times for closed operating days", () => {
    const openDay = (day: "monday" | "tuesday" | "wednesday") => ({
      closesAt: "18:00",
      day,
      isClosed: false,
      opensAt: "08:00",
    })

    expect(
      prescriptionStoreSettingsFormSchema.parse({
        consentVersion: "2026-08-09",
        contactPolicy: "Contact customers only about their request.",
        deliveryEnabled: false,
        operatingHours: [
          openDay("monday"),
          openDay("tuesday"),
          openDay("wednesday"),
          {
            closesAt: "18:00",
            day: "thursday",
            isClosed: false,
            opensAt: "08:00",
          },
          {
            closesAt: "18:00",
            day: "friday",
            isClosed: false,
            opensAt: "08:00",
          },
          { closesAt: "", day: "saturday", isClosed: true, opensAt: "" },
          { closesAt: "", day: "sunday", isClosed: true, opensAt: "" },
        ],
        pickupEnabled: true,
        servicePolicy: "Require pharmacist release before quotation.",
      }),
    ).toMatchObject({
      operatingHours: [
        {},
        {},
        {},
        {},
        {},
        { closesAt: undefined, opensAt: undefined },
        { closesAt: undefined, opensAt: undefined },
      ],
    })
  })
})
