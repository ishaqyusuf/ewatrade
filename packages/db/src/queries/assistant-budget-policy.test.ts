import { expect, test } from "bun:test"
import { assistantBudgetAdmission } from "./assistant-budget-policy"
const tokenOnly = { maxTokens: 5_000_000, windowMs: 32 * 24 * 60 * 60 * 1000 }
test("GENERAL admits more than 100 replies while tokens remain and refuses the token ceiling", () => {
  expect(
    assistantBudgetAdmission({ requests: 1_001, tokens: 600_001 }, tokenOnly),
  ).toEqual({ allowed: true, remainingRequests: 4_399_999 })
  expect(
    assistantBudgetAdmission({ requests: 1_001, tokens: 5_000_000 }, tokenOnly),
  ).toEqual({ allowed: false, remainingRequests: 0 })
  expect(
    assistantBudgetAdmission({ requests: 1, tokens: 5_000_001 }, tokenOnly)
      .allowed,
  ).toBe(false)
})
test("count-limited workflows retain their existing count and token admission", () => {
  const counted = { ...tokenOnly, maxRequests: 100 }
  expect(
    assistantBudgetAdmission({ requests: 99, tokens: 1 }, counted),
  ).toEqual({ allowed: true, remainingRequests: 0 })
  expect(
    assistantBudgetAdmission({ requests: 100, tokens: 1 }, counted).allowed,
  ).toBe(false)
  expect(
    assistantBudgetAdmission({ requests: 1, tokens: 5_000_000 }, counted)
      .allowed,
  ).toBe(false)
})
