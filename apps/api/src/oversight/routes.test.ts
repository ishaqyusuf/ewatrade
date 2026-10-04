import { expect, test } from "bun:test"
import { validOversightKey } from "./verify-key"
test("service access rejects missing, malformed, truncated and incorrect credentials", () => {
  const key = "a".repeat(64)
  expect(validOversightKey(undefined, key)).toBe(false)
  expect(validOversightKey(key, undefined)).toBe(false)
  expect(validOversightKey("a", "a")).toBe(false)
  expect(validOversightKey(key.slice(1), key)).toBe(false)
  expect(validOversightKey("b".repeat(64), key)).toBe(false)
  expect(validOversightKey(key, key)).toBe(true)
})
