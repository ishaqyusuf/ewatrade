import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalActionSchema,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import type { reviewStaffRemovalInTransaction } from "@ewatrade/db/queries"
import { staffRemovalReviewLines } from "./general-staff-removal"

test("staff removal is a planned Owner/Admin dashboard command with a status receipt", () => {
  expect(
    generalActionSchema.parse({
      action: "staff_removal",
      membershipId: "member",
      expectedRevision: 3,
      reason: "Invited by mistake",
    }).action,
  ).toBe("staff_removal")
  expect(
    generalActionSchema.safeParse({
      action: "staff_removal",
      membershipId: "member",
      expectedRevision: 3,
      reason: "Invited by mistake",
      status: "removed",
    }).success,
  ).toBe(false)
  const entries = capabilityManifest.filter((row) =>
    row.id.startsWith("staff.removal."),
  )
  expect(entries.map((row) => row.id).sort()).toEqual([
    "staff.removal.review",
    "staff.removal.unaccepted",
  ])
  for (const entry of entries) {
    expect(entry.clients).toEqual(["dashboard"])
    expect(entry.policy.roles).toEqual(["OWNER", "ADMIN"])
    expect(entry.rollout).toBe("planned")
    expect(entry.scope).toBe("tenant")
  }
  const write = entries.find((row) => row.id === "staff.removal.unaccepted")
  expect(write?.receipt).toBe("staff_status")
  expect(write?.procedures).toEqual(["retailOps.removeUnacceptedStaff"])
})

test("staff removal review says who, why and what stops working", () => {
  const review = {
    membershipId: "member",
    name: "Bola Ahmed",
    email: "bola@example.test",
    role: "CASHIER",
    status: "INVITED",
    invitedAt: "2026-10-18T08:12:00.000Z",
    expectedRevision: 3,
    liveInviteLinks: 1,
    reason: "Invited by mistake",
    impact:
      "They never joined. Their invite links stop working, unsent invite emails are cancelled and their staff seat is freed.",
    reviewHash: "a".repeat(64),
  } satisfies Awaited<ReturnType<typeof reviewStaffRemovalInTransaction>>
  const lines = staffRemovalReviewLines(review).join("\n")
  expect(lines).toContain("Bola Ahmed · bola@example.test · never joined.")
  expect(lines).toContain("Current access revision 3.")
  expect(lines).toContain("Reason: Invited by mistake.")
  expect(lines).toContain("1 live invite link(s) will stop working.")
  expect(lines).toContain("staff seat is freed")
  expect(
    generalActionSummary(
      {
        action: "staff_removal",
        membershipId: "member",
        expectedRevision: 3,
        reason: "Invited by mistake",
      },
      "NGN",
    ),
  ).toBe("Remove someone who never joined")
})
