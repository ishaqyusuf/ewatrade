import { describe, expect, test } from "bun:test"

import { isCustomerShellPath } from "@/lib/app-lock-route"

describe("mobile app lock route boundary", () => {
  test("keeps customer Store links and the customer shell outside Business lock", () => {
    expect(isCustomerShellPath(["r", "store-token"])).toBe(true)
    expect(isCustomerShellPath(["(customer)", "conversations"])).toBe(true)
    expect(isCustomerShellPath(["customer-account-login"])).toBe(false)
  })

  test("continues protecting Business routes", () => {
    expect(isCustomerShellPath(["(admin-tabs)", "admin-home"])).toBe(false)
    expect(isCustomerShellPath(["dashboard"])).toBe(false)
  })
})
