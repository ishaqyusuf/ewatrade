import { describe, expect, test } from "bun:test"
import { serviceWorkOriginalTargetSchema } from "./service-work-original"

describe("original Service record navigation", () => {
  test("requires the exact owning Job and branch identity", () => {
    for (const target of [
      { kind: "service_work", jobId: "job", eventId: "event" },
      { kind: "service_work_note", jobId: "job", recordId: "note" },
      { kind: "service_work_exception", jobId: "job", recordId: "exception" },
    ])
      expect<unknown>(serviceWorkOriginalTargetSchema.parse(target)).toEqual(
        target,
      )
    for (const target of [
      { kind: "service_work", jobId: "job", recordId: "event" },
      { kind: "service_work_note", jobId: "job", eventId: "note" },
      { kind: "service_work_exception", recordId: "exception" },
      { kind: "service_work", jobId: " ", eventId: "event" },
      { kind: "service_work", jobId: "job", eventId: "x".repeat(129) },
      { kind: "service_work_latest", jobId: "job" },
    ])
      expect(serviceWorkOriginalTargetSchema.safeParse(target).success).toBe(
        false,
      )
  })
  test("refuses authority, time, payload and clinical fields on every branch", () => {
    for (const kind of [
      "service_work",
      "service_work_note",
      "service_work_exception",
    ]) {
      const target = {
        kind,
        jobId: "job",
        ...(kind === "service_work"
          ? { eventId: "event" }
          : { recordId: "record" }),
      }
      for (const field of [
        "actorUserId",
        "tenantId",
        "storeId",
        "createdAt",
        "occurredAt",
        "payload",
        "prescriptionId",
      ]) {
        expect(
          serviceWorkOriginalTargetSchema.safeParse({
            ...target,
            [field]: "injected",
          }).success,
        ).toBe(false)
      }
    }
  })
})
