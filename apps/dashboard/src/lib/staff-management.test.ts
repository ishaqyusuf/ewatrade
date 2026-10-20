import { describe, expect, test } from "bun:test"
import {
  type StaffMemberRow,
  canManageStaff,
  canUpdateStaffStatus,
  filterStaffRows,
  getNextStaffStatus,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "./staff-management"

const staff: StaffMemberRow[] = [
  {
    acceptedAt: "2026-07-14T00:00:00.000Z",
    createdAt: "2026-07-14T00:00:00.000Z",
    id: "membership_1",
    invitedAt: "2026-07-13T00:00:00.000Z",
    invitedByUserId: "owner_1",
    role: "MANAGER",
    status: "ACTIVE",
    updatedAt: "2026-07-14T00:00:00.000Z",
    user: {
      avatarUrl: null,
      displayName: "Store Manager",
      email: "manager@example.com",
      id: "user_1",
      image: null,
      name: "Manager Name",
    },
  },
  {
    acceptedAt: null,
    createdAt: "2026-07-14T00:00:00.000Z",
    id: "membership_2",
    invitedAt: "2026-07-14T00:00:00.000Z",
    invitedByUserId: "owner_1",
    role: "CASHIER",
    status: "INVITED",
    updatedAt: "2026-07-14T00:00:00.000Z",
    user: {
      avatarUrl: null,
      displayName: "",
      email: "cashier@example.com",
      id: "user_2",
      image: null,
      name: "Cashier Name",
    },
  },
  {
    acceptedAt: "2026-07-12T00:00:00.000Z",
    createdAt: "2026-07-12T00:00:00.000Z",
    id: "membership_3",
    invitedAt: "2026-07-11T00:00:00.000Z",
    invitedByUserId: "owner_1",
    role: "OPERATOR",
    status: "SUSPENDED",
    updatedAt: "2026-07-13T00:00:00.000Z",
    user: {
      avatarUrl: null,
      displayName: "",
      email: "operator@example.com",
      id: "user_3",
      image: null,
      name: "",
    },
  },
]

describe("staff management helpers", () => {
  test("allows manager-level roles to manage staff", () => {
    expect(canManageStaff("OWNER")).toBe(true)
    expect(canManageStaff("ADMIN")).toBe(true)
    expect(canManageStaff("MANAGER")).toBe(true)
    expect(canManageStaff("CASHIER")).toBe(false)
    expect(canManageStaff("OPERATOR")).toBe(false)
    expect(canManageStaff(null)).toBe(false)
  })

  test("formats staff identity, roles, and statuses", () => {
    expect(getStaffDisplayName(staff[0])).toBe("Store Manager")
    expect(getStaffDisplayName(staff[2])).toBe("operator@example.com")
    expect(getStaffRoleLabel("CASHIER")).toBe("Cashier")
    expect(getStaffStatusLabel("SUSPENDED")).toBe("Suspended")
  })

  test("filters by search, role, and status", () => {
    expect(
      filterStaffRows(staff, { search: "cashier" }).map((member) => member.id),
    ).toEqual(["membership_2"])
    expect(
      filterStaffRows(staff, { role: "operator" }).map((member) => member.id),
    ).toEqual(["membership_3"])
    expect(
      filterStaffRows(staff, { status: "active" }).map((member) => member.id),
    ).toEqual(["membership_1"])
  })

  test("limits status changes to mutable staff roles", () => {
    expect(canUpdateStaffStatus(staff[0])).toBe(true)
    expect(canUpdateStaffStatus({ ...staff[0], role: "OWNER" })).toBe(false)
    expect(getNextStaffStatus(staff[0])).toBe("suspended")
    expect(getNextStaffStatus(staff[2])).toBe("active")
  })
})
