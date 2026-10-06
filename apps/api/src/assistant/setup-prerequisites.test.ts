import { describe, expect, test } from "bun:test"
import { setupPrerequisiteNeeds } from "./setup-prerequisites"

const product = (state: string) => ({
  kind: "PRODUCT" as const,
  state,
  payload: { kind: "product", name: "Eggs", unitName: "Crate" },
  errorCode: null,
})
const customer = (
  state: string,
  opening: boolean,
  errorCode: string | null = null,
) => ({
  kind: "CUSTOMER" as const,
  state,
  payload: {
    kind: "customer",
    name: "Mama Ade",
    ...(opening
      ? { opening: { direction: "owes_business", amountMinor: 1_500_000 } }
      : {}),
  },
  errorCode,
})

describe("setup prerequisite needs", () => {
  test("Terms only matter while catalog records remain to be added", () => {
    expect(setupPrerequisiteNeeds([product("CONFIRMED")]).catalog).toBe(true)
    expect(setupPrerequisiteNeeds([product("FAILED")]).catalog).toBe(true)
    expect(setupPrerequisiteNeeds([product("COMMITTED")]).catalog).toBe(false)
    expect(setupPrerequisiteNeeds([product("SKIPPED")]).catalog).toBe(false)
    expect(setupPrerequisiteNeeds([customer("CONFIRMED", true)]).catalog).toBe(
      false,
    )
  })

  test("Finance only matters for customers with an opening balance", () => {
    expect(setupPrerequisiteNeeds([customer("CONFIRMED", true)]).balances).toBe(
      true,
    )
    expect(
      setupPrerequisiteNeeds([customer("CONFIRMED", false)]).balances,
    ).toBe(false)
    expect(setupPrerequisiteNeeds([customer("SKIPPED", true)]).balances).toBe(
      false,
    )
    expect(
      setupPrerequisiteNeeds([
        customer("COMMITTED", true, "OPENING_BALANCE_NEEDS_FINANCE"),
      ]).balances,
    ).toBe(true)
    expect(
      setupPrerequisiteNeeds([customer("COMMITTED", true, null)]).balances,
    ).toBe(false)
  })
})
