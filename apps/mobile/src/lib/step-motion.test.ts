import { expect, test } from "bun:test"
import { stepDirection, stepEnterOffset } from "./step-motion"

const domains = [
  "list",
  "details",
  "search",
  "owner",
  "review",
  "progress",
  "connect",
  "verify",
] as const

test("direction follows any ordered step list, numeric or named", () => {
  expect(stepDirection([1, 2, 3, 4], 1, 2)).toBe("forward")
  expect(stepDirection([1, 2, 3, 4], 4, 2)).toBe("back")
  expect(stepDirection(domains, "search", "owner")).toBe("forward")
  expect(stepDirection(domains, "verify", "list")).toBe("back")
  expect(stepDirection(domains, "owner", "owner")).toBe("none")
})

test("a step outside the order never moves", () => {
  expect(stepDirection<string>(domains, "list", "unknown")).toBe("none")
  expect(stepEnterOffset("none", false)).toBe(0)
})

test("Reduce Motion keeps every step still", () => {
  expect(stepEnterOffset("forward", true)).toBe(0)
  expect(stepEnterOffset("back", true)).toBe(0)
  expect(stepEnterOffset("forward", false)).toBe(24)
  expect(stepEnterOffset("back", false)).toBe(-24)
})
