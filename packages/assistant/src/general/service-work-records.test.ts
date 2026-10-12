import { expect, test } from "bun:test"
import {
  type ServiceWorkRecordAction,
  serviceWorkRecordAction,
  serviceWorkRecordReceipt,
} from "./service-work-records"

test("work records retain explicit text/category and reject scope, command, lifecycle and receipt injection", () => {
  const note = {
    action: "service_work_note",
    jobId: "job",
    body: "Customer requested a careful wash",
  } satisfies ServiceWorkRecordAction
  expect(serviceWorkRecordAction.parse(note)).toEqual(note)
  for (const field of [
    "tenantId",
    "storeId",
    "actorUserId",
    "clientCommandId",
    "expectedRevision",
    "eventId",
    "recordId",
    "createdAt",
    "occurredAt",
    "toStatus",
    "outcome",
    "notifyCustomer",
  ])
    expect(
      serviceWorkRecordAction.safeParse({ ...note, [field]: "injected" })
        .success,
    ).toBe(false)
  const exception = serviceWorkRecordAction.parse({
    action: "service_work_exception",
    jobId: "job",
    lineId: "line",
    type: "quality",
    description: "  Hem needs inspection  ",
  })
  if (exception.action !== "service_work_exception")
    throw Error("Wrong record intention")
  expect(exception.description).toBe("Hem needs inspection")
  expect(
    serviceWorkRecordAction.safeParse({
      action: "service_work_exception",
      jobId: "job",
      type: "resolved",
      description: "Done",
    }).success,
  ).toBe(false)
})
test("record text is nonempty and bounded and optional line identity stays exact", () => {
  const note = { action: "service_work_note", jobId: "job", body: "Note" }
  for (const body of [" ", "x".repeat(4001)])
    expect(serviceWorkRecordAction.safeParse({ ...note, body }).success).toBe(
      false,
    )
  expect(
    serviceWorkRecordAction.safeParse({ ...note, lineId: "" }).success,
  ).toBe(false)
  expect(
    serviceWorkRecordAction.safeParse({ ...note, body: "x".repeat(4000) })
      .success,
  ).toBe(true)
  expect(
    serviceWorkRecordAction.safeParse({
      action: "service_work_exception",
      jobId: "job",
      type: "delay",
      description: "x".repeat(2001),
    }).success,
  ).toBe(false)
})
test("receipt keeps the original owning record and cannot invent a work event or resolved exception", () => {
  const common = {
    recordId: "original-note",
    jobId: "job",
    lineId: null,
    recordedAt: "2026-10-12T10:00:00.123Z",
    title: "Internal work note recorded",
    detail: "ORD-1 · Internal note",
  }
  expect(
    serviceWorkRecordReceipt.parse({ ...common, kind: "service_work_note" })
      .recordId,
  ).toBe("original-note")
  expect(
    serviceWorkRecordReceipt.safeParse({
      ...common,
      kind: "service_work_note",
      eventId: "invented-event",
    }).success,
  ).toBe(false)
  const exception = {
    ...common,
    kind: "service_work_exception",
    exceptionType: "DELAY",
    outcome: "OPEN",
    occurredAt: "2026-10-12T10:00:00.456Z",
  }
  expect(serviceWorkRecordReceipt.safeParse(exception).success).toBe(true)
  expect(
    serviceWorkRecordReceipt.safeParse({ ...exception, outcome: "RESOLVED" })
      .success,
  ).toBe(false)
  expect(
    serviceWorkRecordReceipt.safeParse({ ...exception, occurredAt: undefined })
      .success,
  ).toBe(false)
})
