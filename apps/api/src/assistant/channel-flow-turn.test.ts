import { expect, test } from "bun:test"
import { flowRefusalText } from "./channel-flow-turn"

test("each refused form says why and that nothing was saved", () => {
  const reasons = ["used", "scope", "expired", "fields", "other"] as const
  const texts = reasons.map(flowRefusalText)
  expect(new Set(texts).size).toBe(reasons.length)
  for (const text of texts) expect(text).toContain("Nothing")
  expect(flowRefusalText("used")).toContain("already used")
  expect(flowRefusalText("scope")).toContain("different business or Store")
  expect(flowRefusalText("expired")).toContain("expired")
})
