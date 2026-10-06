import { describe, expect, test } from "bun:test"
import {
  type StaffAccess,
  canStaffAccessStore,
  canStaffPerform,
} from "./store-access"

const scoped: StaffAccess = {
  businessRole: "MANAGER",
  status: "ACTIVE",
  mode: "SCOPED",
  catalogEditor: false,
  assignments: [
    { storeId: "farm", role: "OPERATOR", status: "ACTIVE" },
    { storeId: "shop", role: "CASHIER", status: "ACTIVE" },
    { storeId: "office", role: "MANAGER", status: "ACTIVE" },
  ],
}

describe("staff authority boundaries", () => {
  test("roles never leak between Stores", () => {
    expect(canStaffPerform(scoped, "stock", "farm")).toBe(true)
    expect(canStaffPerform(scoped, "orders", "shop")).toBe(true)
    expect(canStaffPerform(scoped, "stock", "shop")).toBe(false)
    expect(canStaffPerform(scoped, "reconciliation", "farm")).toBe(false)
    expect(canStaffPerform(scoped, "reconciliation", "office")).toBe(true)
    expect(canStaffAccessStore(scoped, "new-store")).toBe(false)
  })
  test("business catalog grant requires an active Manager assignment", () => {
    expect(canStaffPerform(scoped, "catalog")).toBe(false)
    expect(canStaffPerform({ ...scoped, catalogEditor: true }, "catalog")).toBe(
      true,
    )
    expect(
      canStaffPerform(
        {
          ...scoped,
          catalogEditor: true,
          assignments: scoped.assignments.slice(0, 2),
        },
        "catalog",
      ),
    ).toBe(false)
    expect(canStaffPerform(scoped, "staff")).toBe(false)
  })
  test("revocation and business suspension override remembered roles", () => {
    const revoked = {
      ...scoped,
      assignments: scoped.assignments.map((row) => ({
        ...row,
        status: "REVOKED",
      })),
    }
    expect(canStaffAccessStore(revoked, "farm")).toBe(false)
    expect(canStaffPerform(revoked, "stock", "farm")).toBe(false)
    expect(
      canStaffPerform(
        { ...scoped, status: "SUSPENDED", businessRole: "OWNER" },
        "stock",
        "farm",
      ),
    ).toBe(false)
  })
  test("legacy Operator remains sales-only and legacy Manager retains access", () => {
    expect(
      canStaffPerform(
        { ...scoped, mode: "LEGACY", businessRole: "OPERATOR" },
        "stock",
        "farm",
      ),
    ).toBe(false)
    expect(
      canStaffPerform(
        { ...scoped, mode: "LEGACY", businessRole: "MANAGER" },
        "catalog",
      ),
    ).toBe(true)
    expect(
      canStaffPerform(
        { ...scoped, mode: "LEGACY", businessRole: "MANAGER" },
        "staff",
      ),
    ).toBe(true)
  })
  test("Owner/Admin have all-Store authority; Support/Member gain none", () => {
    for (const businessRole of ["OWNER", "ADMIN"] as const) {
      expect(
        canStaffPerform({ ...scoped, businessRole }, "stock", "new-store"),
      ).toBe(true)
    }
    for (const businessRole of ["SUPPORT", "MEMBER"] as const) {
      expect(
        canStaffPerform(
          { ...scoped, businessRole, mode: "LEGACY" },
          "orders",
          "farm",
        ),
      ).toBe(false)
    }
  })
})
