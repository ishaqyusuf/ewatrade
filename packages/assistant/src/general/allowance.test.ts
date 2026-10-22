import { expect, test } from "bun:test"
import { generalTokenBudgetLine, generalTokenBudgetUsed } from "./allowance"
test("GENERAL clients gate only tokens and show no reply cap", () => {
  const allowance = {
    remainingTokens: 4_399_999,
    remainingRequests: 0,
    resetsAt: "2026-11-01T00:00:00Z",
  }
  expect(generalTokenBudgetUsed(allowance)).toBe(false)
  expect(generalTokenBudgetLine(allowance)).toContain(
    "tokens left · no reply cap",
  )
  expect(generalTokenBudgetLine(allowance)).not.toContain("requests")
  expect(generalTokenBudgetUsed({ remainingTokens: 0 })).toBe(true)
  expect(
    generalTokenBudgetLine({ ...allowance, remainingTokens: 0 }),
  ).toContain("Token budget used")
})
