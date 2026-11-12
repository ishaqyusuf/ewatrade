import { expect, test } from "bun:test"
import {
  isPaystackSubscriptionReturn,
  openSubscriptionCheckout,
} from "./subscription-checkout-navigation"

function run(checkoutUrl: string | null, status = "provider_not_configured") {
  const visits: string[] = []
  const notices: string[] = []
  const errors: string[] = []
  openSubscriptionCheckout(
    { checkoutUrl, intent: { status }, message: "Checkout is unavailable." },
    {
      navigate: (url) => visits.push(url),
      notify: (message) => notices.push(message),
      error: (message) => errors.push(message),
    },
  )
  return { visits, notices, errors }
}

test("a payable server checkout navigates without claiming payment success", () => {
  const url = "https://checkout.paystack.com/example-session"
  expect(run(url)).toEqual({ visits: [url], notices: [], errors: [] })
})

test("an unavailable provider shows an error and never navigates", () => {
  expect(run(null)).toEqual({
    visits: [],
    notices: [],
    errors: ["Checkout is unavailable."],
  })
})

test("an already active plan remains an informational result", () => {
  expect(run(null, "active_plan")).toEqual({
    visits: [],
    notices: ["Checkout is unavailable."],
    errors: [],
  })
})

test("invalid payment destinations fail without leaving the dashboard", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,checkout",
    "http://checkout.paystack.com/session",
    "https://user:password@checkout.paystack.com/session",
    "//checkout.paystack.com/session",
    "/settings/billing",
  ]) {
    const result = run(url)
    expect(result.visits).toEqual([])
    expect(result.notices).toEqual([])
    expect(result.errors).toHaveLength(1)
  }
})

test("only a subscription checkout reference counts as a Paystack return", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
  expect(
    isPaystackSubscriptionReturn(`?trxref=ewasub-${id}&reference=ewasub-${id}`),
  ).toBe(true)
  expect(isPaystackSubscriptionReturn("")).toBe(false)
  expect(isPaystackSubscriptionReturn("?reference=domain-123")).toBe(false)
})
