import { describe, expect, test } from "bun:test"

import {
  canManageOfflineReviews,
  canManageOfflineSettings,
  requiresOfflineApproval,
} from "./offline"

describe("offline settings permissions", () => {
  test("reserves the business policy toggle for owners and admins", () => {
    expect(canManageOfflineSettings("OWNER")).toBe(true)
    expect(canManageOfflineSettings("ADMIN")).toBe(true)

    for (const role of [
      "MANAGER",
      "CASHIER",
      "OPERATOR",
      "SUPPORT",
      "MEMBER",
    ]) {
      expect(canManageOfflineSettings(role)).toBe(false)
    }
  })

  test("allows management roles to resolve staged offline records", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      expect(canManageOfflineReviews(role)).toBe(true)
    }
    for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER"]) {
      expect(canManageOfflineReviews(role)).toBe(false)
    }
  })

  test("stages staff records only when approval is enabled", () => {
    expect(requiresOfflineApproval("CASHIER", true)).toBe(true)
    expect(requiresOfflineApproval("OPERATOR", true)).toBe(true)
    expect(requiresOfflineApproval("OWNER", true)).toBe(false)
    expect(requiresOfflineApproval("ADMIN", true)).toBe(false)
    expect(requiresOfflineApproval("MANAGER", true)).toBe(false)
    expect(requiresOfflineApproval("CASHIER", false)).toBe(false)
  })
})
