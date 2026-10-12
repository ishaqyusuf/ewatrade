import { expect, test } from "bun:test"
import {
  staffStatusAction,
  staffStatusReadInput,
  staffStatusReviewInput,
} from "./staff-status"

const draft = {
  action: "staff_status",
  membershipId: "exact-member",
  status: "suspended",
  expectedRevision: 7,
  reason: "  Review access  ",
}
test("staff status pins exact member, current revision and required reason without authority injection", () => {
  expect(staffStatusAction.parse(draft).reason).toBe("Review access")
  for (const extra of [
    { actorUserId: "owner" },
    { tenantId: "business" },
    { assignments: [] },
    { approvalToken: "token" },
  ])
    expect(staffStatusAction.safeParse({ ...draft, ...extra }).success).toBe(
      false,
    )
  for (const expectedRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(
      staffStatusAction.safeParse({ ...draft, expectedRevision }).success,
    ).toBe(false)
  for (const reason of ["", " ", "x".repeat(501)])
    expect(staffStatusAction.safeParse({ ...draft, reason }).success).toBe(
      false,
    )
  expect(
    staffStatusAction.safeParse({ ...draft, status: "invited" }).success,
  ).toBe(false)
})
test("staff review resolves current revision server-side and original receipt uses only exact event identity", () => {
  expect(
    staffStatusReviewInput.parse({
      membershipId: "member",
      status: "active",
      reason: "Return to work",
    }),
  ).toEqual({
    membershipId: "member",
    status: "active",
    reason: "Return to work",
  })
  expect(
    staffStatusReviewInput.safeParse({
      membershipId: "member",
      status: "active",
      reason: "Return",
      expectedRevision: 1,
    }).success,
  ).toBe(false)
  expect(staffStatusReadInput.safeParse({ eventId: "" }).success).toBe(false)
  expect(
    staffStatusReadInput.safeParse({ eventId: "original", tenantId: "other" })
      .success,
  ).toBe(false)
})
