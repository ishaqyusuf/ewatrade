import { expect, test } from "bun:test"
import {
  generalAnswerSchema,
  generalAnswerTargetSchema,
  staffDirectoryTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalStaffDirectoryAnswer,
  generalStaffDirectoryInput,
} from "./general-staff-reads"

test("staff directory navigation preserves canonical filters without authority or query limits", () => {
  const filters = {
    search: " Amina ",
    role: "SUPPORT",
    status: "REMOVED",
    assignmentStoreId: "exact-store",
    cursor: "original-cursor",
  }
  const target = staffDirectoryTargetSchema.parse({
    kind: "staff_directory",
    filters,
  })
  expect(target.filters).toEqual(generalStaffDirectoryInput.parse(filters))
  expect(generalAnswerTargetSchema.parse(target)).toEqual(target)
  for (const role of [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "OPERATOR",
    "SUPPORT",
    "MEMBER",
  ])
    expect(
      generalStaffDirectoryInput.safeParse(
        staffDirectoryTargetSchema.parse({
          kind: "staff_directory",
          filters: { role },
        }).filters,
      ).success,
    ).toBe(true)
  for (const status of ["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"])
    expect(
      generalStaffDirectoryInput.safeParse(
        staffDirectoryTargetSchema.parse({
          kind: "staff_directory",
          filters: { status },
        }).filters,
      ).success,
    ).toBe(true)
  for (const invalid of [
    { tenantId: "foreign" },
    { actorUserId: "other" },
    { limit: 100 },
    { acceptanceToken: "secret" },
    { search: " " },
    { search: "a".repeat(121) },
    { cursor: "a".repeat(1025) },
    { role: "UNLISTED" },
    { status: "UNLISTED" },
  ])
    expect(
      staffDirectoryTargetSchema.safeParse({
        kind: "staff_directory",
        filters: invalid,
      }).success,
    ).toBe(false)
  expect(
    staffDirectoryTargetSchema.safeParse({
      kind: "staff_directory",
      filters: {},
      url: "https://example.test",
    }).success,
  ).toBe(false)
})

test("directory answer opens its exact query filters and preserves truthful empty continuation count", () => {
  const filters = generalStaffDirectoryInput.parse({
    search: "Amina",
    role: "CASHIER",
    status: "INVITED",
    assignmentStoreId: "store",
    cursor: "continuation",
  })
  const answer = generalStaffDirectoryAnswer(
    {
      data: [],
      total: 4,
      nextCursor: null,
      scope: "active_store_assignments",
      assignmentStoreId: "store",
      asOf: "2026-10-12T00:00:00Z",
      coverage: {
        directory: "current_memberships",
        profile: "available",
        history: "not_read",
      },
    },
    filters,
  )
  expect(answer.target).toEqual({ kind: "staff_directory", filters })
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.value).toBe("4 matching memberships")
  expect(answer.detail).toContain("0 on this page")
  expect(answer.detail).toContain("History has not been read")
  expect(answer.scope).toContain("explicit active Store assignments")
})
