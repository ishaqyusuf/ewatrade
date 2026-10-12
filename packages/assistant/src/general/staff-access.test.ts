import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalReceiptSchema,
  generalAnswerTargetSchema,
} from "./contracts"
import { capabilityManifest } from "../capabilities/manifest"
import {
  type GeneralStaffAccessAction,
  staffAccessAction,
  staffAccessReviewInput,
  staffAccessTargetSchema,
} from "./staff-access"

const payload = {
  action: "staff_access",
  membershipId: "member",
  expectedRevision: 7,
  confirmLegacyCutover: false,
  assignments: [{ storeId: "shop", role: "MANAGER" }],
  defaultStoreId: "shop",
  catalogEditor: true,
} satisfies GeneralStaffAccessAction
test("strict access action contains only canonical grant intent", () => {
  expect(staffAccessAction.parse(payload)).toEqual(payload)
  for (const fields of [
    { tenantId: "foreign" },
    { actorUserId: "owner" },
    { storeId: "foreign" },
    { reason: "not a native field" },
    { businessRole: "ADMIN" },
    { handover: "someone" },
    { status: "ACTIVE" },
  ])
    expect(staffAccessAction.safeParse({ ...payload, ...fields }).success).toBe(
      false,
    )
  expect(
    staffAccessAction.safeParse({ ...payload, expectedRevision: 0 }).success,
  ).toBe(false)
  expect(
    staffAccessAction.safeParse({
      ...payload,
      assignments: [{ storeId: "shop", role: "OWNER" }],
    }).success,
  ).toBe(false)
})
test("review can load legacy impact before explicit acknowledgment and receives revision only from server", () => {
  const { action: _action, expectedRevision: _revision, ...review } = payload
  expect(staffAccessReviewInput.parse(review).confirmLegacyCutover).toBe(false)
  expect(
    staffAccessReviewInput.safeParse({ ...review, expectedRevision: 7 })
      .success,
  ).toBe(false)
})
test("original access target accepts only saved event identity", () => {
  expect(
    staffAccessTargetSchema.parse({ kind: "staff_access", eventId: " event " }),
  ).toEqual({ kind: "staff_access", eventId: "event" })
  for (const fields of [
    { membershipId: "member" },
    { url: "/staff" },
    { tenantId: "other" },
  ])
    expect(
      staffAccessTargetSchema.safeParse({
        kind: "staff_access",
        eventId: "event",
        ...fields,
      }).success,
    ).toBe(false)
})

test("public dispatch retains the access action, original receipt target and administrative ceiling", () => {
  expect(generalActionSchema.parse(payload)).toEqual(payload)
  expect(
    generalReceiptSchema.parse({
      kind: "staff_access",
      recordId: "original-event",
      title: "Staff Store access updated",
      detail: "Original revision 8",
    }).recordId,
  ).toBe("original-event")
  expect(
    generalAnswerTargetSchema.parse({
      kind: "staff_access",
      eventId: "original-event",
    }),
  ).toEqual({ kind: "staff_access", eventId: "original-event" })
  const capabilities = capabilityManifest.filter((row) =>
    row.id.startsWith("staff.access."),
  )
  expect(capabilities).toHaveLength(3)
  for (const capability of capabilities) {
    expect(capability.policy.roles).toEqual(["OWNER", "ADMIN"])
    expect(capability.clients).toEqual(["dashboard"])
    expect(capability.rollout).toBe("planned")
  }
})
