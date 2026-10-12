import { describe, expect, test } from "bun:test"
import {
  moneyAccountCanTake,
  moneyAccountPaymentMethods,
  moneyAccountPaymentMethodsProblem,
} from "./finance-payment-methods"

describe("money account payment methods", () => {
  test("accounts without a saved choice take their type's defaults", () => {
    expect(
      moneyAccountPaymentMethods({ purpose: "CASH", paymentMethods: [] }),
    ).toEqual(["cash"])
    expect(
      moneyAccountPaymentMethods({ purpose: "BANK", paymentMethods: [] }),
    ).toEqual(["bank_transfer", "pos", "card"])
    expect(
      moneyAccountPaymentMethods({ purpose: "CLEARING", paymentMethods: [] }),
    ).toEqual(["pos", "card", "other"])
  })
  test("saved database values are normalized, ordered and kept coherent", () => {
    expect(
      moneyAccountPaymentMethods({
        purpose: "BANK",
        paymentMethods: ["POS", "BANK_TRANSFER", "CASH"],
      }),
    ).toEqual(["bank_transfer", "pos"])
  })
  test("cash only lands in cash accounts", () => {
    expect(moneyAccountCanTake("CASH", "cash")).toBe(true)
    expect(moneyAccountCanTake("CASH", "pos")).toBe(false)
    expect(moneyAccountCanTake("BANK", "cash")).toBe(false)
    expect(moneyAccountCanTake("CLEARING", "other")).toBe(true)
  })
  test("explains lists that cannot be saved", () => {
    expect(moneyAccountPaymentMethodsProblem("BANK", ["pos"])).toBeNull()
    expect(moneyAccountPaymentMethodsProblem("BANK", [])).toBe(
      "Choose at least one payment method.",
    )
    expect(moneyAccountPaymentMethodsProblem("BANK", ["pos", "pos"])).toBe(
      "Choose each payment method once.",
    )
    expect(moneyAccountPaymentMethodsProblem("BANK", ["cash"])).toBe(
      "Cash payments go into a cash account.",
    )
    expect(moneyAccountPaymentMethodsProblem("CASH", ["card"])).toBe(
      "Cash accounts only take cash.",
    )
    expect(moneyAccountPaymentMethodsProblem("BANK", ["customer_credit"])).toBe(
      "Choose a valid payment method.",
    )
  })
})
