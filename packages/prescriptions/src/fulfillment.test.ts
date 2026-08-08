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

  test("encrypts sensitive delivery data at the domain boundary", () => {
    const encrypted = encryptPrescriptionData({ addressLine1: "1 Test Road" })
    expect(encrypted).not.toContain("Test Road")
    expect(decryptPrescriptionData(encrypted)).toEqual({
      addressLine1: "1 Test Road",
    })
  })
})
