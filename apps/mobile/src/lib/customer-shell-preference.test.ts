import { describe, expect, test } from "bun:test"

import { normalizeLastMobileShell } from "./customer-shell-preference"

describe("last mobile shell preference", () => {
  test("accepts only explicit non-secret shell names", () => {
    expect(normalizeLastMobileShell("customer")).toBe("customer")
    expect(normalizeLastMobileShell("business")).toBe("business")
    expect(normalizeLastMobileShell("credential-token")).toBe("business")
    expect(normalizeLastMobileShell(null)).toBe("business")
  })
})
