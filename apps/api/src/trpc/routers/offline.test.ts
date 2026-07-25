import { describe, expect, test } from "bun:test"

import { canManageOfflineSettings } from "./offline"

describe("offline settings permissions", () => {
  test("reserves the business policy toggle for the owner", () => {
    expect(canManageOfflineSettings("OWNER")).toBe(true)

    for (const role of [
      "ADMIN",
      "MANAGER",
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
    ]) {
      expect(canManageOfflineSettings(role)).toBe(false)
    }
  })
})
