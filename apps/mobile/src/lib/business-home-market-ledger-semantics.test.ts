import { describe, expect, test } from "bun:test"
import { getBusinessHomeLedgerStepSemantics } from "./business-home-market-ledger-semantics"

describe("Business Home ledger step semantics", () => {
  test("distinguishes completed, locked, and actionable steps", () => {
    expect(
      getBusinessHomeLedgerStepSemantics({
        disabled: false,
        hasAction: false,
      }),
    ).toEqual({
      accessibilityRole: undefined,
      accessibilityState: undefined,
      available: false,
    })
    expect(
      getBusinessHomeLedgerStepSemantics({
        disabled: true,
        hasAction: false,
      }),
    ).toMatchObject({
      accessibilityState: { disabled: true },
      available: false,
    })
    expect(
      getBusinessHomeLedgerStepSemantics({
        disabled: false,
        hasAction: true,
      }),
    ).toMatchObject({ accessibilityRole: "button", available: true })
  })
})
