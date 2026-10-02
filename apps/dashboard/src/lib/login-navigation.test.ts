import { expect, test } from "bun:test"
import { getLoginDestination } from "./login-navigation"

test("keeps dashboard paths and query parameters", () => {
  expect(getLoginDestination("/inventory?view=stock#history")).toBe(
    "/inventory?view=stock#history",
  )
})

test("rejects external, malformed, login and API destinations", () => {
  for (const next of [
    undefined,
    "https://outside.example",
    "//outside.example",
    "/\\outside.example",
    "/\\[",
    "/login?next=/login",
    "/api/auth/logout",
  ]) {
    expect(getLoginDestination(next)).toBe("/")
  }
})
