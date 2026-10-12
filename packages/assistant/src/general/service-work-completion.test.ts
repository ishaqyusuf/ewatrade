import { expect, test } from "bun:test"
import {
  type ServiceWorkCompletionAction,
  type ServiceWorkCompletionReceipt,
  serviceWorkCompletionAction,
  serviceWorkCompletionReceipt,
} from "./service-work-completion"

test("rework and settled-only handoff intentions refuse authority, execution, notification and payment injection", () => {
  const actions: ServiceWorkCompletionAction[] = [
    {
      action: "service_work_rework",
      jobId: "original-job",
      lineId: "completed-line",
      quantity: "0.125",
      reason: "Redo the stated allocation",
    },
    {
      action: "service_work_handoff",
      jobId: "ready-job",
      note: "Collected by customer",
    },
  ]
  for (const value of actions) {
    expect(serviceWorkCompletionAction.parse(value)).toEqual(value)
    for (const field of [
      "tenantId",
      "storeId",
      "actorUserId",
      "clientCommandId",
      "expectedRevision",
      "payment",
      "notifyCustomer",
      "eventId",
    ])
      expect(
        serviceWorkCompletionAction.safeParse({ ...value, [field]: "injected" })
          .success,
      ).toBe(false)
  }
  for (const quantity of ["0", "-1", "1.0000001", "NaN"])
    expect(
      serviceWorkCompletionAction.safeParse({ ...actions[0], quantity })
        .success,
    ).toBe(false)
})
test("completion receipts preserve exact owning event, source links and both stored times", () => {
  const original = {
    kind: "service_work",
    recordId: "new-rework-job",
    eventId: "original-rework-event",
    eventType: "REWORK",
    sourceJobId: "original-job",
    sourceLineId: "completed-line",
    recordedAt: "2026-10-12T13:00:00.123Z",
    effectiveAt: "2026-10-11T13:00:00.456Z",
    title: "Rework recorded",
    detail: "Linked original allocation",
  } satisfies ServiceWorkCompletionReceipt
  expect(serviceWorkCompletionReceipt.parse(original)).toEqual(original)
  expect(
    serviceWorkCompletionReceipt.safeParse({
      ...original,
      eventType: "STATUS_CHANGED",
    }).success,
  ).toBe(false)
  expect(
    serviceWorkCompletionReceipt.safeParse({ ...original, eventId: undefined })
      .success,
  ).toBe(false)
  expect(
    serviceWorkCompletionReceipt.safeParse({
      ...original,
      sourceLineId: undefined,
    }).success,
  ).toBe(false)
  expect(
    serviceWorkCompletionReceipt.safeParse({ ...original, sourceLineId: null })
      .success,
  ).toBe(false)
  expect(
    serviceWorkCompletionReceipt.safeParse({
      ...original,
      eventType: "REMOTE_HANDOFF",
      recordId: "original-job",
      sourceLineId: null,
    }).success,
  ).toBe(true)
})
