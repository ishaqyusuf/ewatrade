import { expect, test } from "bun:test"
import {
  type ServiceWorkLifecycleAction,
  serviceWorkLifecycleAction,
  serviceWorkLifecycleReceipt,
} from "./service-work"

test("lifecycle intentions reject scope, revision, history and command injection", () => {
  const action = {
    action: "service_job_assign",
    jobId: "job",
    assigneeUserId: "staff",
  } satisfies ServiceWorkLifecycleAction
  expect(serviceWorkLifecycleAction.parse(action)).toEqual(action)
  for (const field of [
    "tenantId",
    "storeId",
    "actorUserId",
    "expectedRevision",
    "clientCommandId",
    "eventId",
    "effectiveAt",
    "source",
    "notifyCustomer",
  ])
    expect(
      serviceWorkLifecycleAction.safeParse({ ...action, [field]: "injected" })
        .success,
    ).toBe(false)
})
test("exact work line, valid promised time and block/cancel reasons are required; handoff stays separate", () => {
  const line = {
    action: "service_job_line_transition",
    jobId: "job",
    lineId: "line",
    toStatus: "in_progress",
  }
  expect(serviceWorkLifecycleAction.safeParse(line).success).toBe(true)
  expect(
    serviceWorkLifecycleAction.safeParse({ ...line, lineId: "" }).success,
  ).toBe(false)
  for (const toStatus of ["blocked", "cancelled", "completed", "handoff"])
    expect(
      serviceWorkLifecycleAction.safeParse({ ...line, toStatus }).success,
    ).toBe(false)
  expect(
    serviceWorkLifecycleAction.safeParse({
      ...line,
      toStatus: "blocked",
      reason: "Awaiting customer instructions",
    }).success,
  ).toBe(true)
  expect(
    serviceWorkLifecycleAction.safeParse({
      action: "service_job_reschedule",
      jobId: "job",
      reason: "Customer requested later pickup",
      promisedAt: "2026-10-15T10:00:00.123Z",
    }).success,
  ).toBe(true)
  expect(
    serviceWorkLifecycleAction.safeParse({
      action: "service_job_reschedule",
      jobId: "job",
      reason: "Later",
      promisedAt: "tomorrow",
    }).success,
  ).toBe(false)
})
test("saved lifecycle receipt binds the original event identity and timestamps", () => {
  const receipt = {
    kind: "service_work",
    recordId: "job",
    eventId: "original-event",
    eventType: "STATUS_CHANGED",
    recordedAt: "2026-10-12T10:00:00Z",
    effectiveAt: "2026-10-12T10:00:00Z",
    title: "Work progress recorded",
    detail: "ORD-1 · Wash",
  }
  expect(serviceWorkLifecycleReceipt.parse(receipt).eventId).toBe(
    "original-event",
  )
  expect(
    serviceWorkLifecycleReceipt.safeParse({ ...receipt, eventId: "" }).success,
  ).toBe(false)
  expect(
    serviceWorkLifecycleReceipt.safeParse({
      ...receipt,
      eventType: "HANDED_OFF",
    }).success,
  ).toBe(false)
})
