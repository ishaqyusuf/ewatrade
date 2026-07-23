import { describe, expect, test } from "bun:test"

import {
  serviceBatchNotificationIntentSchema,
  serviceBatchUpdateSchema,
  serviceIntakeCreateSchema,
  serviceJobHandoffSchema,
  serviceWorkQueuePageSchema,
} from "./services"

describe("service commerce completion schemas", () => {
  test("accepts cursor pagination and a service queue search query", () => {
    const result = serviceWorkQueuePageSchema.parse({
      cursor: "job-cursor-1",
      direction: "forward",
      limit: 20,
      query: "pickup",
    })

    expect(result.cursor).toBe("job-cursor-1")
    expect(result.direction).toBe("forward")
    expect(result.query).toBe("pickup")
  })
  test("accepts express intake with a deposit and customer channel", () => {
    const result = serviceIntakeCreateSchema.parse({
      clientIntakeId: "intake-express-001",
      customerPhone: "+2348000000000",
      initialPaymentMethod: "cash",
      initialPaymentMinor: 5_000,
      lines: [{ offeringId: "shirt-wash-small", quantity: "2" }],
      notificationChannel: "whatsapp",
      schemaVersion: 1,
      serviceLevel: "express",
    })

    expect(result.serviceLevel).toBe("express")
    expect(result.initialPaymentMinor).toBe(5_000)
    expect(result.notificationChannel).toBe("whatsapp")
  })

  test("accepts an atomic collection payment and handoff command", () => {
    const result = serviceJobHandoffSchema.parse({
      clientCommandId: "handoff-command-001",
      expectedRevision: 3,
      jobId: "job-1",
      payment: {
        amountMinor: 10_000,
        method: "pos",
        reference: "POS-1042",
      },
    })

    expect(result.payment?.method).toBe("pos")
  })

  test("limits operational and communication batches to 100 jobs", () => {
    const jobs = Array.from({ length: 101 }, (_, index) => ({
      expectedRevision: 0,
      jobId: `job-${index}`,
    }))
    expect(() =>
      serviceBatchUpdateSchema.parse({
        action: "mark_ready",
        jobs,
        reason: "Batch ready",
      }),
    ).toThrow()
    expect(() =>
      serviceBatchNotificationIntentSchema.parse({
        channel: "sms",
        clientBatchId: "batch-101",
        jobs: jobs.map(({ jobId }) => ({ jobId, message: "Ready" })),
        templatePurpose: "ready",
      }),
    ).toThrow()
  })
})
