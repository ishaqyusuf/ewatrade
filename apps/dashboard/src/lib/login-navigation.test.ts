import { expect, test } from "bun:test"
import {
  getLoginDestination,
  isPaymentLoginDestination,
} from "./login-navigation"

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

test("payment account entry admits only exact payment return paths", () => {
  for (const next of ["/p/AbCdEfGhIjKlMnOpQr_-12", "/pay/v1.signed-token"])
    expect(isPaymentLoginDestination(next)).toBe(true)
  for (const next of [
    null,
    "/",
    "/inventory",
    "/p/short",
    "/p/AbCdEfGhIjKlMnOpQr_-12/image",
    "/pay/token/private",
    "/pay/token?next=/inventory",
    "/pay/token#private",
    "//evil.test/pay/token",
    "/\\evil.test/pay/token",
  ])
    expect(isPaymentLoginDestination(next)).toBe(false)
})
