import { expect, test } from "bun:test"
import {
  generalAnswerSchema,
  generalAnswerTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalStaffDirectoryAnswer,
  generalStaffMemberAnswer,
} from "./general-staff-reads"

test("exact staff navigation is strict, preserves history and cannot carry authority", () => {
  const target = { kind: "staff_member", membershipId: " exact-member " }
  expect(generalAnswerTargetSchema.parse(target)).toEqual({
    kind: "staff_member",
    membershipId: "exact-member",
  })
  for (const invalid of [
    { ...target, tenantId: "foreign" },
    { ...target, actorUserId: "other" },
    { ...target, url: "https://example.test" },
    { ...target, membershipId: " " },
    { ...target, membershipId: "a".repeat(161) },
    { kind: "staff_history", membershipId: "member", filters: {} },
    { kind: "staff_history", filters: { tenantId: "foreign" } },
  ])
    expect(generalAnswerTargetSchema.safeParse(invalid).success).toBe(false)
  expect(
    generalAnswerTargetSchema.parse({
      kind: "staff_history",
      filters: { membershipId: "member" },
    }),
  ).toEqual({ kind: "staff_history", filters: { membershipId: "member" } })
})

test("maximum staff answer previews remain saveable with exact identity and honest coverage", () => {
  const member = {
    membershipId: "exact-member",
    userId: "user",
    name: "Very long original name ".repeat(100),
    email: `${"long-email".repeat(100)}@example.test`,
    role: "CASHIER" as const,
    status: "INVITED" as const,
    invitedAt: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profileCoverage: "unavailable" as const,
    scope: "tenant_membership" as const,
    historyCoverage: "not_read" as const,
  }
  const answer = generalStaffMemberAnswer(member)
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.target).toEqual({
    kind: "staff_member",
    membershipId: "exact-member",
  })
  expect(answer.title).toEndWith("…")
  expect(answer.detail).toContain("accepted date unavailable")
  expect(answer.detail).toContain("history have not been read")
  expect(
    generalAnswerSchema.safeParse({ ...answer, target: undefined }).success,
  ).toBe(true)
  const directory = generalStaffDirectoryAnswer({
    data: Array.from({ length: 10 }, (_, i) => ({
      ...member,
      membershipId: `exact-${i}`,
    })),
    total: 1000,
    nextCursor: "cursor",
    scope: "tenant_memberships",
    assignmentStoreId: null,
    asOf: "2026-10-12T00:00:00Z",
    coverage: {
      directory: "current_memberships",
      profile: "partial",
      history: "not_read",
    },
  })
  expect(generalAnswerSchema.safeParse(directory).success).toBe(true)
  expect(directory.value).toBe("1000 matching memberships")
  expect(directory.detail).toContain("Name/email preview:")
  expect(directory.detail).toContain("10 on this page")
  expect(directory.detail).toContain("original filters and cursor")
  expect(directory.detail).toContain("History has not been read")
  expect(directory.detail).toContain("legacy Store access is not inferred")
})
