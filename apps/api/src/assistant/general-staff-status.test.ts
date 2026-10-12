import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalActionSchema,
  generalAnswerTargetSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import type { reviewStaffStatusChangeInTransaction } from "@ewatrade/db/queries"
import { StaffStoreAccessError } from "@ewatrade/db/staff-store-access"
import {
  staffStatusOperation,
  staffStatusReviewLines,
} from "./general-staff-status"

test("staff status is registered with an original event target and an administrative dashboard ceiling", () => {
  expect(
    generalActionSchema.parse({
      action: "staff_status",
      membershipId: "member",
      status: "suspended",
      expectedRevision: 4,
      reason: "Leave",
    }).action,
  ).toBe("staff_status")
  expect(
    generalReceiptSchema.parse({
      kind: "staff_status",
      recordId: "original-event",
      title: "Staff suspended",
      detail: "Original outcome",
    }).recordId,
  ).toBe("original-event")
  expect(
    generalAnswerTargetSchema.parse({
      kind: "staff_status",
      eventId: " original-event ",
    }),
  ).toEqual({ kind: "staff_status", eventId: "original-event" })
  for (const extra of [
    { membershipId: "member" },
    { tenantId: "other" },
    { actorUserId: "owner" },
    { url: "/staff" },
  ])
    expect(
      generalAnswerTargetSchema.safeParse({
        kind: "staff_status",
        eventId: "event",
        ...extra,
      }).success,
    ).toBe(false)
  const entries = capabilityManifest.filter((row) =>
    row.id.startsWith("staff.status."),
  )
  expect(entries).toHaveLength(3)
  for (const entry of entries) {
    expect(entry.clients).toEqual(["dashboard"])
    expect(entry.policy.roles).toEqual(["OWNER", "ADMIN"])
    expect(entry.rollout).toBe("planned")
    expect(entry.scope).toBe("tenant")
  }
})

test("staff status review retains every current grant and distinguishes whole-business outcome from restored access", () => {
  const review = {
    membershipId: "member",
    name: "Person",
    email: "person@example.test",
    role: "CASHIER",
    previousStatus: "SUSPENDED",
    nextStatus: "ACTIVE",
    acceptedAt: "2026-10-10T00:00:00Z",
    expectedRevision: 4,
    accessMode: "SCOPED",
    catalogEditor: false,
    defaultStoreId: "store-0",
    reason: "Return to work",
    scope: "business_membership",
    reviewHash: "a".repeat(64),
    impact:
      "Reactivate this business membership using its current access only. Removed Store grants are not restored.",
    assignments: Array.from({ length: 100 }, (_, i) => ({
      storeId: `store-${i}`,
      storeName: `Current Store ${i}`,
      storeStatus: "ACTIVE",
      role: "CASHIER",
      revision: 1,
    })),
  } satisfies Awaited<ReturnType<typeof reviewStaffStatusChangeInTransaction>>
  const lines = staffStatusReviewLines(review).join("\n")
  expect(lines).toContain("whole business membership")
  expect(lines).toContain("SUSPENDED → ACTIVE")
  expect(lines).toContain("Current access revision 4")
  expect(lines).toContain("Reason: Return to work")
  expect(lines).toContain("Current Store 0 · CASHIER · starting Store")
  expect(lines).toContain("Current Store 99 · CASHIER")
  expect(lines).toContain("Removed Store grants are not restored")
  expect(lines).toContain(
    "does not change Store grants, roles or historical ownership",
  )
})

test("canonical staff status refusal codes remain typed and unexpected faults escape", async () => {
  for (const code of ["INVALID_INPUT", "FORBIDDEN", "CONFLICT"] as const) {
    try {
      await staffStatusOperation(async () => {
        throw new StaffStoreAccessError(code, "Native refusal")
      })
      throw Error("Expected refusal")
    } catch (error) {
      expect(error).toMatchObject({
        code: code === "INVALID_INPUT" ? "BAD_REQUEST" : code,
        message: "Native refusal",
      })
    }
  }
  const fault = Error("Original receipt persistence fault")
  await expect(
    staffStatusOperation(async () => {
      throw fault
    }),
  ).rejects.toBe(fault)
})
