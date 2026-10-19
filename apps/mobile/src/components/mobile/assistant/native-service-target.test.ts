import { expect, test } from "bun:test"
import { generalReceiptSchema } from "@ewatrade/assistant/general/contracts"
import {
  nativeServiceOriginalRoute,
  nativeServiceReceiptRoute,
  readNativeServiceOriginalTarget,
} from "./native-service-target"

test("service receipt Opens preserve the exact owning event, note, exception, intake and quotation tuple", () => {
  for (const [receipt, target] of [
    [
      {
        kind: "service_intake",
        recordId: "saved-intake",
        orderId: "saved-order",
        title: "Saved",
        detail: "Saved",
      },
      {
        kind: "service_intake",
        intakeId: "saved-intake",
        orderId: "saved-order",
      },
    ],
    [
      {
        kind: "service_work",
        recordId: "saved-job",
        eventId: "saved-event",
        eventType: "ASSIGNED",
        recordedAt: "2026-10-15T10:00:00.123Z",
        effectiveAt: "2026-10-15T10:00:00.123Z",
        title: "Saved",
        detail: "Saved",
      },
      { kind: "service_work", jobId: "saved-job", eventId: "saved-event" },
    ],
    [
      {
        kind: "service_work_note",
        recordId: "saved-note",
        jobId: "saved-job",
        lineId: null,
        recordedAt: "2026-10-15T10:00:00Z",
        title: "Saved",
        detail: "Saved",
      },
      { kind: "service_work_note", jobId: "saved-job", recordId: "saved-note" },
    ],
    [
      {
        kind: "service_work_exception",
        recordId: "saved-exception",
        jobId: "saved-job",
        lineId: "saved-line",
        recordedAt: "2026-10-15T10:00:00Z",
        occurredAt: "2026-10-14T10:00:00Z",
        exceptionType: "QUALITY",
        outcome: "OPEN",
        title: "Saved",
        detail: "Saved",
      },
      {
        kind: "service_work_exception",
        jobId: "saved-job",
        recordId: "saved-exception",
      },
    ],
    [
      {
        kind: "commerce_quote_decision",
        recordId: "saved-approval",
        quoteId: "saved-quote",
        quoteVersionId: "saved-version",
        decision: "approved",
        policyRevision: 7,
        decidedAt: "2026-10-15T10:00:00Z",
        decidedByMembershipId: "saved-member",
        reason: "Agreed exact terms",
        releaseState: "released",
        title: "Saved",
        detail: "Saved",
      },
      {
        kind: "commerce_quote_approval",
        approvalId: "saved-approval",
        quoteId: "saved-quote",
        quoteVersionId: "saved-version",
      },
    ],
  ] as const) {
    const route = nativeServiceReceiptRoute(generalReceiptSchema.parse(receipt))
    expect(route?.pathname).toBe("/service-jobs-modal")
    expect(readNativeServiceOriginalTarget(route?.params.target)).toEqual(
      target,
    )
  }
})

test("rework opens the new Job's saved event, retaining the source Job as a separate fact", () => {
  const receipt = generalReceiptSchema.parse({
    kind: "service_work",
    recordId: "new-rework-job",
    eventId: "new-rework-event",
    eventType: "REWORK",
    recordedAt: "2026-10-15T10:00:00Z",
    effectiveAt: "2026-10-15T10:00:00Z",
    sourceJobId: "completed-source-job",
    sourceLineId: "completed-source-line",
    title: "Saved",
    detail: "Saved",
  })
  expect(nativeServiceReceiptRoute(receipt)?.params.target).toBe(
    JSON.stringify({
      kind: "service_work",
      jobId: "new-rework-job",
      eventId: "new-rework-event",
    }),
  )
})

test("missing originals, authority fields, malformed and oversized links never become a Job queue or related Order", () => {
  for (const raw of [
    { kind: "service_work", jobId: "job" },
    { kind: "service_work_note", recordId: "note" },
    { kind: "service_intake", intakeId: "intake" },
    {
      kind: "commerce_quote_approval",
      approvalId: "approval",
      quoteId: "quote",
    },
    {
      kind: "service_work",
      jobId: "job",
      eventId: "event",
      actorUserId: "foreign",
    },
    {
      kind: "service_intake",
      intakeId: "intake",
      orderId: "order",
      storeId: "foreign",
    },
    {
      kind: "service_work_exception",
      jobId: "job",
      recordId: "exception",
      url: "https://example.test",
    },
    { kind: "service_work", jobId: " ", eventId: "event" },
  ]) {
    expect(nativeServiceOriginalRoute(raw)).toBeNull()
    expect(readNativeServiceOriginalTarget(JSON.stringify(raw))).toBeNull()
  }
  for (const raw of [undefined, ["{}"], "bad-json", "x".repeat(2049)])
    expect(readNativeServiceOriginalTarget(raw)).toBeNull()
})

test("booking original and current Job use distinct strict native targets", () => {
  const booking = {
    kind: "service_booking" as const,
    bookingId: "saved-booking",
    sourceId: "saved-source",
    offeringId: "saved-offering",
  }
  const job = { kind: "service_job" as const, jobId: "exact-current-job" }
  for (const target of [booking, job]) {
    const route = nativeServiceOriginalRoute(target)
    expect(route?.pathname).toBe("/service-jobs-modal")
    expect(readNativeServiceOriginalTarget(route?.params.target)).toEqual(
      target,
    )
    expect(
      nativeServiceOriginalRoute({ ...target, tenantId: "foreign" }),
    ).toBeNull()
  }
  expect(
    nativeServiceOriginalRoute({ ...booking, sourceId: undefined }),
  ).toBeNull()
  expect(nativeServiceOriginalRoute({ ...job, jobId: "" })).toBeNull()
})
