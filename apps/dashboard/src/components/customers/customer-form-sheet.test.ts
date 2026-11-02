import { describe, expect, test } from "bun:test"
import { startingBalanceMinor } from "./customer-form-sheet"

describe("startingBalanceMinor", () => {
  test("no starting balance sends nothing", () => {
    expect(startingBalanceMinor("none", "")).toEqual({ minor: null })
  })

  test("turns naira with commas or kobo into exact minor units", () => {
    expect(startingBalanceMinor("owes", "5,000")).toEqual({ minor: "500000" })
    expect(startingBalanceMinor("credit", "12.5")).toEqual({ minor: "1250" })
  })

  test("asks for a positive amount in the chosen direction's words", () => {
    expect(startingBalanceMinor("owes", "").error).toBe(
      "Enter how much they owe, like 5000.",
    )
    expect(startingBalanceMinor("credit", "0").error).toBe(
      "Enter how much they paid ahead, like 5000.",
    )
    expect(startingBalanceMinor("owes", "1.234").minor).toBeNull()
  })
})
