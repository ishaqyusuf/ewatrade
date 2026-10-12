import { expect, test } from "bun:test"
import {
  type GeneralReceipt,
  generalActionSchema,
  generalActionSummary,
  generalReceiptSchema,
} from "./contracts"
import { respondGeneralRehearsal } from "./rehearsal"
import {
  type ServiceWorkEditorAction,
  serviceWorkEditorInput,
} from "./service-work-editor"

test("all seven strict intentions join GENERAL without accepting execution or scope controls", () => {
  const actions: ServiceWorkEditorAction[] = [
    {
      action: "service_work_rework",
      jobId: "job",
      lineId: "line",
      quantity: "1.25",
      reason: "Redo completed work",
    },
    { action: "service_work_handoff", jobId: "job", note: "Collected" },
    { action: "service_job_assign", jobId: "job", assigneeUserId: "staff" },
    {
      action: "service_job_reschedule",
      jobId: "job",
      promisedAt: "2026-10-15T12:00:00.123Z",
      reason: "Customer requested later pickup",
    },
    {
      action: "service_job_line_transition",
      jobId: "job",
      lineId: "line",
      toStatus: "blocked",
      reason: "Awaiting instructions",
    },
    {
      action: "service_work_note",
      jobId: "job",
      lineId: "line",
      body: "Customer will bring a spare button",
    },
    {
      action: "service_work_exception",
      jobId: "job",
      type: "delay",
      description: "Awaiting spare part",
    },
  ]
  for (const action of actions) {
    expect(generalActionSchema.parse(action)).toEqual(action)
    expect(generalActionSummary(action, "NGN")).toBeTruthy()
    for (const field of [
      "tenantId",
      "storeId",
      "actorUserId",
      "clientCommandId",
      "eventId",
      "approvalToken",
    ])
      expect(
        generalActionSchema.safeParse({ ...action, [field]: "injected" })
          .success,
      ).toBe(false)
  }
  expect(
    serviceWorkEditorInput.safeParse({ jobId: "job", storeId: "other" })
      .success,
  ).toBe(false)
})
test("GENERAL preserves original lifecycle event and both owning record receipts", () => {
  const original = {
    kind: "service_work",
    recordId: "job",
    eventId: "original-event",
    eventType: "STATUS_CHANGED",
    recordedAt: "2026-10-12T12:00:00.123Z",
    effectiveAt: "2026-10-10T12:00:00Z",
    title: "Work recorded",
    detail: "Original event",
  } satisfies GeneralReceipt
  expect(generalReceiptSchema.parse(original)).toEqual(original)
  expect(
    generalReceiptSchema.safeParse({ ...original, eventId: undefined }).success,
  ).toBe(false)
  const note = {
    kind: "service_work_note",
    recordId: "original-note",
    jobId: "job",
    lineId: "line",
    recordedAt: "2026-10-12T12:00:00Z",
    title: "Note recorded",
    detail: "Private",
  } satisfies GeneralReceipt
  expect(generalReceiptSchema.parse(note)).toEqual(note)
  expect(
    generalReceiptSchema.safeParse({ ...note, eventId: "fake" }).success,
  ).toBe(false)
  const exception = {
    ...note,
    kind: "service_work_exception",
    recordId: "original-exception",
    exceptionType: "DELAY",
    outcome: "OPEN",
    occurredAt: "2026-10-11T12:00:00Z",
  } satisfies GeneralReceipt
  expect(generalReceiptSchema.parse(exception)).toEqual(exception)
  expect(
    generalReceiptSchema.safeParse({ ...exception, occurredAt: undefined })
      .success,
  ).toBe(false)
  expect(
    generalReceiptSchema.safeParse({ ...exception, outcome: "RESOLVED" })
      .success,
  ).toBe(false)
})
test("new receipt branches retain Finance Book and original Intake Order requirements", () => {
  const receipt = { recordId: "record", title: "Recorded", detail: "Original" }
  expect(
    generalReceiptSchema.safeParse({ ...receipt, kind: "finance_movement" })
      .success,
  ).toBe(false)
  expect(
    generalReceiptSchema.safeParse({
      ...receipt,
      kind: "finance_movement",
      bookId: "book",
    }).success,
  ).toBe(true)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, kind: "service_intake" })
      .success,
  ).toBe(false)
  expect(
    generalReceiptSchema.safeParse({
      ...receipt,
      kind: "service_intake",
      orderId: "order",
    }).success,
  ).toBe(true)
  expect(
    generalReceiptSchema.safeParse({
      ...receipt,
      kind: "order",
      arbitrary: true,
    }).success,
  ).toBe(false)
})
test("provider-free rehearsal resolves saved work before drafting an intention", () => {
  for (const content of [
    "rework this service line",
    "handoff this job",
    "assign this service job to Amina",
    "reschedule this job",
    "start this line",
    "note this work",
    "record exception this job",
  ])
    expect(respondGeneralRehearsal([{ role: "user", content }])).toEqual({
      kind: "tool",
      toolName: "readServices",
      input: {},
    })
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "find service work matching Amina" },
    ]),
  ).toEqual({
    kind: "tool",
    toolName: "readServices",
    input: { query: "Amina" },
  })
})

test("GENERAL completion receipts retain owning event and original source links", () => {
  const receipt = {
    kind: "service_work",
    recordId: "new-job",
    eventId: "original-event",
    eventType: "REWORK",
    sourceJobId: "source-job",
    sourceLineId: "source-line",
    recordedAt: "2026-10-12T12:00:00.123Z",
    effectiveAt: "2026-10-11T12:00:00.456Z",
    title: "Rework",
    detail: "Original retained",
  } satisfies GeneralReceipt
  expect(generalReceiptSchema.parse(receipt)).toEqual(receipt)
  expect(
    generalReceiptSchema.safeParse({ ...receipt, sourceLineId: null }).success,
  ).toBe(false)
  expect(
    generalReceiptSchema.safeParse({
      ...receipt,
      recordId: receipt.sourceJobId,
    }).success,
  ).toBe(false)
  const handoff = {
    ...receipt,
    recordId: receipt.sourceJobId,
    eventType: "REMOTE_HANDOFF",
    sourceLineId: null,
  } satisfies GeneralReceipt
  expect(generalReceiptSchema.parse(handoff)).toEqual(handoff)
  expect(
    generalReceiptSchema.safeParse({ ...handoff, sourceLineId: "fake" })
      .success,
  ).toBe(false)
})
