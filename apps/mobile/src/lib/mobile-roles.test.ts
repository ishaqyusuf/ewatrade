import { describe, expect, test } from "bun:test"

import {
  canEditMobileCatalog,
  canManageMobileOperations,
  canManageMobileStaff,
  canManageMobileStock,
  isSalesRepRole,
} from "./mobile-roles"

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

test("stock access requires explicit scoped Operator cutover", () => {
  expect(canManageMobileStock("OPERATOR", "SCOPED")).toBe(true)
  expect(canManageMobileStock("OPERATOR", "LEGACY")).toBe(false)
  expect(canManageMobileStock("OPERATOR")).toBe(false)
  expect(canManageMobileStock("CASHIER", "SCOPED")).toBe(false)
  expect(canManageMobileOperations("OPERATOR")).toBe(false)
})

test("scoped Manager catalog and staff controls require business authority", () => {
  expect(
    canEditMobileCatalog({
      role: "MANAGER",
      staffAccessMode: "SCOPED",
      catalogEditor: false,
    }),
  ).toBe(false)
  expect(
    canEditMobileCatalog({
      role: "MANAGER",
      staffAccessMode: "SCOPED",
      catalogEditor: true,
    }),
  ).toBe(true)
  expect(
    canManageMobileStaff({ role: "MANAGER", staffAccessMode: "SCOPED" }),
  ).toBe(false)
  expect(
    canManageMobileStaff({ role: "OWNER", staffAccessMode: "SCOPED" }),
  ).toBe(true)
})
