import { describe, expect, test } from "bun:test"

import { canManageMobileOperations, isSalesRepRole } from "./mobile-roles"

describe("mobile role capabilities", () => {
  test("limits management actions to owner, admin, and manager roles", () => {
    expect(canManageMobileOperations("OWNER")).toBe(true)
    expect(canManageMobileOperations("ADMIN")).toBe(true)
    expect(canManageMobileOperations("MANAGER")).toBe(true)
    expect(canManageMobileOperations("CASHIER")).toBe(false)
    expect(canManageMobileOperations("OPERATOR")).toBe(false)
  })

  test("keeps cashier and operator roles in the attendant experience", () => {
    expect(isSalesRepRole("CASHIER")).toBe(true)
    expect(isSalesRepRole("OPERATOR")).toBe(true)
    expect(isSalesRepRole("MANAGER")).toBe(false)
  })
})
