import { expect, test } from "bun:test"
import { staffRemovalAction, staffRemovalReviewInput } from "./staff-removal"

test("staff removal needs an exact member, a reviewed revision and a reason", () => {
  const valid = {
    action: "staff_removal",
    membershipId: " member ",
    expectedRevision: 2,
    reason: " Never accepted ",
  }
  expect(staffRemovalAction.parse(valid)).toEqual({
    action: "staff_removal",
    membershipId: "member",
    expectedRevision: 2,
    reason: "Never accepted",
  })
  for (const bad of [
    { ...valid, reason: " " },
    { ...valid, reason: "x".repeat(501) },
    { ...valid, expectedRevision: 0 },
    { ...valid, tenantId: "other" },
  ])
    expect(staffRemovalAction.safeParse(bad).success).toBe(false)
  expect(
    staffRemovalReviewInput.safeParse({ membershipId: "m", reason: "r" })
      .success,
  ).toBe(true)
  expect(
    staffRemovalReviewInput.safeParse({
      membershipId: "m",
      reason: "r",
      expectedRevision: 1,
    }).success,
  ).toBe(false)
})
