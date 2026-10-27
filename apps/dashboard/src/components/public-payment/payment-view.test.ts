import { expect, test } from "bun:test"
import { outcomeNextStep } from "./payment-view"

test("a part payment offers paying the rest; it never reopens the form by itself", () => {
  expect(
    outcomeNextStep("partially_paid", {
      linkState: "active",
      balanceMinor: 150_000,
    }),
  ).toBe("pay_remaining")
})

test("a report the business didn't find offers telling them again", () => {
  expect(
    outcomeNextStep("not_received", {
      linkState: "active",
      balanceMinor: 200_000,
    }),
  ).toBe("tell_again")
})

test("a full payment, a settled order or a closed link offers no payment action", () => {
  expect(
    outcomeNextStep("paid", { linkState: "active", balanceMinor: 150_000 }),
  ).toBeNull()
  for (const outcome of ["partially_paid", "not_received"] as const) {
    expect(
      outcomeNextStep(outcome, { linkState: "paid", balanceMinor: 0 }),
    ).toBeNull()
    expect(
      outcomeNextStep(outcome, { linkState: "active", balanceMinor: 0 }),
    ).toBeNull()
    for (const linkState of ["expired", "unavailable"] as const)
      expect(
        outcomeNextStep(outcome, { linkState, balanceMinor: 150_000 }),
      ).toBeNull()
  }
})
