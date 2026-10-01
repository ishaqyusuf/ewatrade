import { expect, test } from "bun:test"
import { processRetailOpsBillingProviderEvent } from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

test("preserves the billing failure when recording it fails in an aborted transaction", async () => {
  const original = new Error("write conflict")
  let failureRecordAttempted = false
  const db = {
    billingProviderEvent: {
      findUnique: async () => null,
      create: async () => ({
        id: "event-1",
        eventId: "test-event",
        provider: "MANUAL",
        status: "PENDING",
        type: "subscription_activated",
      }),
      update: async () => {
        failureRecordAttempted = true
        throw new Error("current transaction is aborted")
      },
    },
    tenantSubscription: {
      findUnique: async () => {
        throw original
      },
    },
  } as unknown as DbClient

  await expect(
    processRetailOpsBillingProviderEvent(db, {
      eventId: "test-event",
      provider: "manual",
      subscription: { planId: "pro", tenantId: "tenant-1" },
      tenantId: "tenant-1",
      type: "subscription_activated",
    }),
  ).rejects.toBe(original)
  expect(failureRecordAttempted).toBe(true)
})
