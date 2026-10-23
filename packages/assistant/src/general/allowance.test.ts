import { expect, test } from "bun:test"
import { generalTokenBudgetLine, generalTokenBudgetUsed } from "./allowance"

test("GENERAL allowance gates on tokens even when the deprecated request field disagrees", () => {
  const allowance = {
    remainingTokens: 3_873_128,
    remainingRequests: 0,
    tokenLimit: 5_000_000,
    resetsAt: "2026-11-01T00:00:00Z",
  }
  expect(generalTokenBudgetUsed(allowance)).toBe(false)
  expect(generalTokenBudgetLine(allowance)).toContain(
    `${(3_873_128).toLocaleString()} of ${(5_000_000).toLocaleString()} tokens left`,
  )
  expect(generalTokenBudgetLine(allowance)).toContain("no reply cap")
  expect(generalTokenBudgetLine(allowance)).not.toContain("requests")
  expect(generalTokenBudgetUsed({ remainingTokens: 0 })).toBe(true)
  expect(generalTokenBudgetUsed({ remainingTokens: -1 })).toBe(true)
  expect(
    generalTokenBudgetLine({ ...allowance, remainingTokens: 0 }),
  ).toContain("Token budget used")
})

test("GENERAL allowance uses the supplied ceiling and accepts old snapshots without one", () => {
  const allowance = {
    remainingTokens: 12_345,
    resetsAt: "2026-11-01T00:00:00Z",
  }
  expect(
    generalTokenBudgetLine({ ...allowance, tokenLimit: 20_000_000 }),
  ).toContain(
    `${(12_345).toLocaleString()} of ${(20_000_000).toLocaleString()} tokens left`,
  )
  expect(generalTokenBudgetLine(allowance)).toContain(
    `${(12_345).toLocaleString()} tokens left`,
  )
  expect(generalTokenBudgetLine(allowance)).not.toContain(" of ")
})

test("GENERAL allowance labels the server reset in UTC, including on devices west of UTC", () => {
  const line = generalTokenBudgetLine({
    remainingTokens: 1,
    resetsAt: "2026-11-01T00:00:00Z",
  })
  expect(line).toMatch(/(?:Nov 1|1 Nov)/)
  expect(line).toContain("(UTC)")
  expect(line).not.toContain("Oct")
})
