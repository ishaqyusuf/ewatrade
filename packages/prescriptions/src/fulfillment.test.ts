import { describe, expect, test } from "bun:test"

import {
  assertDeliveryTransition,
  assertPickupTransition,
  decryptPrescriptionData,
  encryptPrescriptionData,
  evaluateDeliveryZone,
} from "./fulfillment"

describe("prescription fulfillment rules", () => {
  test("prevents duplicate terminal fulfillment transitions", () => {
    expect(() => assertPickupTransition("handed_off", "ready")).toThrow()
    expect(() => assertDeliveryTransition("delivered", "in_transit")).toThrow()
  })

  test("fails ambiguous delivery rules safely", () => {
    expect(
      evaluateDeliveryZone(
        [
          {
            feePolicy: "fixed",
            fixedFeeMinor: 500,
            id: "one",
            matchType: "locality",
            matchValues: ["Ikeja"],
            priority: 1,
            promiseText: "Today",
          },
          {
            feePolicy: "fixed",
            fixedFeeMinor: 700,
            id: "two",
            matchType: "locality",
            matchValues: ["Ikeja"],
            priority: 1,
            promiseText: "Tomorrow",
          },
        ],
        { locality: "IKEJA" },
      ),
    ).toEqual({ outcome: "ambiguous" })
  })

  test("selects the highest-priority fixed zone and returns its disclosed fee", () => {
    expect(
      evaluateDeliveryZone(
        [
          {
            feePolicy: "fixed",
            fixedFeeMinor: 1_000,
            id: "locality",
            matchType: "locality",
            matchValues: ["Ikeja"],
            priority: 1,
            promiseText: "Tomorrow",
          },
          {
            feePolicy: "fixed",
            fixedFeeMinor: 500,
            id: "postal",
            matchType: "postal_prefix",
            matchValues: ["100"],
            priority: 2,
            promiseText: "Today",
          },
        ],
        { locality: "Ikeja", postalCode: "100271" },
      ),
    ).toMatchObject({
      feeMinor: 500,
      outcome: "eligible",
      zone: { id: "postal", promiseText: "Today" },
    })
  })

  test("routes manual policies for staff review and rejects unmatched areas", () => {
    const manual = {
      feePolicy: "manual" as const,
      id: "manual",
      matchType: "locality" as const,
      matchValues: ["Lekki"],
      priority: 1,
      promiseText: "After confirmation",
    }
    expect(
      evaluateDeliveryZone([manual], { locality: "  LEKKI " }),
    ).toMatchObject({ outcome: "manual_review", zone: { id: "manual" } })
    expect(evaluateDeliveryZone([manual], { locality: "Surulere" })).toEqual({
      outcome: "ineligible",
    })
  })

  test("encrypts sensitive delivery data at the domain boundary", () => {
    const encrypted = encryptPrescriptionData({ addressLine1: "1 Test Road" })
    expect(encrypted).not.toContain("Test Road")
    expect(decryptPrescriptionData(encrypted)).toEqual({
      addressLine1: "1 Test Road",
    })
  })
})
