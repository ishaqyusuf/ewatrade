import { describe, expect, test } from "bun:test"
import { startingBalanceMinor } from "./starting-balance-model"

describe("startingBalanceMinor", () => {
  test("no starting balance sends nothing", () => {
    expect(startingBalanceMinor("none", "")).toEqual({ minor: null })
  })

  test("reads naira with commas or kobo as exact minor units", () => {
    expect(startingBalanceMinor("owes", "5,000")).toEqual({ minor: "500000" })
    expect(startingBalanceMinor("credit", "0.5")).toEqual({ minor: "50" })
  })

  test("asks for a positive amount in the chosen direction's words", () => {
    expect(startingBalanceMinor("owes", "").error).toBe(
      "Enter how much they owe, like 5000.",
    )
    expect(startingBalanceMinor("credit", "0").error).toBe(
      "Enter how much they paid ahead, like 5000.",
    )
  })
})
