import { describe, expect, test } from "bun:test"
import { isQaDerivedSessionAllowed } from "./qa-session-access"

describe("QA-derived session access classes", () => {
  test.each(["authenticated_global", "platform_admin"] as const)(
    "denies %s access",
    (accessClass) => {
      expect(isQaDerivedSessionAllowed(accessClass, true)).toBe(false)
    },
  )

  test("allows tenant-scoped access", () => {
    expect(isQaDerivedSessionAllowed("tenant_scoped", true)).toBe(true)
  })

  test.each([
    "authenticated_global",
    "platform_admin",
    "tenant_scoped",
  ] as const)(
    "does not change ordinary session access for %s",
    (accessClass) => {
      expect(isQaDerivedSessionAllowed(accessClass, false)).toBe(true)
    },
  )
})
