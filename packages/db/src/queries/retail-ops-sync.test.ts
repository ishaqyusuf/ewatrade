import { describe, expect, test } from "bun:test"
import {
  listRetailOpsSyncConflicts,
  recordRetailOpsSyncRun,
  reviewRetailOpsSyncConflict,
} from "./retail-ops-sync"
import type { DbClient } from "./types"

type SyncCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createMockRecordSyncRunDb() {
  const calls: SyncCall[] = []

  const db = {
    offlineDevice: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findFirst", where })

        return {
          id: "offline_device_123",
          storeId: "store_123",
        }
      },
    },
    retailOpsSyncEvent: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsSyncEvent.upsert",
          where,
        })

        return { id: "sync_event_123" }
      },
    },
    retailOpsSyncRun: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsSyncRun.create" })

        return { id: "sync_run_123" }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function createMockListConflictsDb() {
  const calls: SyncCall[] = []
  const durableProcessedAt = new Date("2026-07-12T12:05:00.000Z")
  const metadataProcessedAt = "2026-07-12T12:00:00.000Z"

  const db = {
    retailOpsSyncEvent: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsSyncEvent.findMany", where })

        return [
          {
            actorUserId: "user_rep",
            deviceId: "device_android",
            errorCode: "CONFLICT",
            errorMessage: "Inventory stock is no longer available.",
            eventId: "event_sale_conflict",
            id: "sync_event_durable",
            processedAt: durableProcessedAt,
            reviewedAt: null,
            reviewedByUserId: null,
            syncRunId: "sync_run_durable",
            type: "sale_created",
          },
        ]
      },
    },
    tenant: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return {
          metadata: {
            retailOps: {
              reviewedSyncEventIds: ["event_reviewed"],
              syncRuns: [
                {
                  actorUserId: "user_rep",
                  appliedCount: 0,
                  completedAt: metadataProcessedAt,
                  deviceId: "device_android",
                  events: [
                    {
                      errorCode: "CONFLICT",
                      errorMessage: "Open session already exists.",
                      eventId: "event_session_conflict",
                      status: "failed",
                      type: "rep_session_opened",
                    },
                    {
                      errorCode: "CONFLICT",
                      errorMessage: "Already reviewed.",
                      eventId: "event_reviewed",
                      status: "failed",
                      type: "sale_created",
                    },
                  ],
                  failedCount: 2,
                  id: "sync_run_metadata",
                  skippedCount: 0,
                  status: "failed",
                  totalCount: 2,
                },
              ],
            },
          },
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
    durableProcessedAt,
    metadataProcessedAt,
  }
}

function createMockReviewConflictDb() {
  const calls: SyncCall[] = []
  const processedAt = new Date("2026-07-12T12:05:00.000Z")

  const db = {
    retailOpsSyncEvent: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsSyncEvent.findFirst", where })

        return { id: "sync_event_123" }
      },
      update: async ({
        data,
        where,
      }: {
        data: { reviewedAt: Date; reviewedByUserId: string }
        where: unknown
      }) => {
        calls.push({ data, kind: "retailOpsSyncEvent.update", where })

        return {
          actorUserId: "user_rep",
          deviceId: "device_android",
          errorCode: "CONFLICT",
          errorMessage: "Credit sale is already paid.",
          eventId: "event_credit_conflict",
          id: "sync_event_123",
          processedAt,
          reviewedAt: data.reviewedAt,
          reviewedByUserId: "user_manager",
          syncRunId: "sync_run_123",
          type: "credit_payment_recorded",
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
    processedAt,
  }
}

function getCalls(calls: SyncCall[], kind: string) {
  return calls.filter((entry) => entry.kind === kind)
}

function getCall(calls: SyncCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops sync queries", () => {
  test("records a durable sync run with device scope, counts, statuses, and event upserts", async () => {
    const db = createMockRecordSyncRunDb()

    const result = await recordRetailOpsSyncRun(db.client, {
      actorUserId: "user_rep",
      deviceId: " device_android ",
      results: [
        {
          eventId: "event_sale_applied",
          status: "applied",
          type: "sale_created",
        },
        {
          error: {
            code: "CONFLICT",
            message: "Inventory stock is no longer available.",
          },
          eventId: "event_stock_failed",
          status: "failed",
          type: "stock_adjustment_recorded",
        },
        {
          error: {
            code: "DEPENDENCY_PENDING",
            message: "Product setup must sync first.",
          },
          eventId: "event_sale_skipped",
          status: "skipped",
          type: "sale_created",
        },
      ],
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      actorUserId: "user_rep",
      appliedCount: 1,
      deviceId: "device_android",
      events: [
        {
          errorCode: null,
          errorMessage: null,
          eventId: "event_sale_applied",
          status: "applied",
          type: "sale_created",
        },
        {
          errorCode: "CONFLICT",
          errorMessage: "Inventory stock is no longer available.",
          eventId: "event_stock_failed",
          status: "failed",
          type: "stock_adjustment_recorded",
        },
        {
          errorCode: "DEPENDENCY_PENDING",
          errorMessage: "Product setup must sync first.",
          eventId: "event_sale_skipped",
          status: "skipped",
          type: "sale_created",
        },
      ],
      failedCount: 1,
      id: "sync_run_123",
      skippedCount: 1,
      status: "partial",
      totalCount: 3,
    })
    expect(new Date(result.completedAt).toString()).not.toBe("Invalid Date")

    const runCreate = getCall(db.calls, "retailOpsSyncRun.create")
    expect(runCreate.data).toMatchObject({
      actorUserId: "user_rep",
      appliedCount: 1,
      deviceId: "device_android",
      failedCount: 1,
      offlineDeviceId: "offline_device_123",
      skippedCount: 1,
      status: "PARTIAL",
      storeId: "store_123",
      tenantId: "tenant_123",
      totalCount: 3,
    })

    const eventUpserts = getCalls(db.calls, "retailOpsSyncEvent.upsert")
    expect(eventUpserts).toHaveLength(3)
    expect(eventUpserts.map((call) => call.data)).toContainEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          eventId: "event_stock_failed",
          errorCode: "CONFLICT",
          errorMessage: "Inventory stock is no longer available.",
          offlineDeviceId: "offline_device_123",
          status: "FAILED",
          storeId: "store_123",
          syncRunId: "sync_run_123",
          tenantId: "tenant_123",
          type: "stock_adjustment_recorded",
        }),
      }),
    )
    expect(eventUpserts.map((call) => call.where)).toContainEqual({
      tenantId_eventId: {
        eventId: "event_sale_applied",
        tenantId: "tenant_123",
      },
    })
  })

  test("lists unreviewed durable and metadata sync conflicts with resolution guidance", async () => {
    const db = createMockListConflictsDb()

    const conflicts = await listRetailOpsSyncConflicts(db.client, {
      deviceId: "device_android",
      limit: 10,
      tenantId: "tenant_123",
    })

    expect(conflicts).toHaveLength(2)
    expect(conflicts[0]).toMatchObject({
      actorUserId: "user_rep",
      deviceId: "device_android",
      errorCode: "CONFLICT",
      eventId: "event_sale_conflict",
      id: "sync_event_durable",
      processedAt: db.durableProcessedAt.toISOString(),
      resolutionAction: "Review stock, then retry",
      reviewedAt: null,
      reviewedByUserId: null,
      syncRunId: "sync_run_durable",
      type: "sale_created",
    })
    expect(conflicts[1]).toMatchObject({
      actorUserId: "user_rep",
      deviceId: "device_android",
      errorCode: "CONFLICT",
      eventId: "event_session_conflict",
      id: "metadata:sync_run_metadata:event_session_conflict",
      processedAt: db.metadataProcessedAt,
      resolutionAction: "Resolve the active session",
      reviewedAt: null,
      reviewedByUserId: null,
      syncRunId: "sync_run_metadata",
      type: "rep_session_opened",
    })
    expect(
      conflicts.some((conflict) => conflict.eventId === "event_reviewed"),
    ).toBe(false)

    expect(
      getCall(db.calls, "retailOpsSyncEvent.findMany").where,
    ).toMatchObject({
      deviceId: "device_android",
      errorCode: "CONFLICT",
      reviewedAt: null,
      status: "FAILED",
      tenantId: "tenant_123",
    })
  })

  test("reviews durable sync conflicts without clearing local device failure state", async () => {
    const db = createMockReviewConflictDb()

    const reviewed = await reviewRetailOpsSyncConflict(db.client, {
      eventId: "event_credit_conflict",
      reviewedByUserId: "user_manager",
      tenantId: "tenant_123",
    })

    expect(reviewed).toMatchObject({
      actorUserId: "user_rep",
      deviceId: "device_android",
      errorCode: "CONFLICT",
      eventId: "event_credit_conflict",
      id: "sync_event_123",
      processedAt: db.processedAt.toISOString(),
      resolutionAction: "Review credit sale",
      reviewedByUserId: "user_manager",
      syncRunId: "sync_run_123",
      type: "credit_payment_recorded",
    })
    expect(new Date(reviewed?.reviewedAt ?? "").toString()).not.toBe(
      "Invalid Date",
    )

    expect(getCall(db.calls, "retailOpsSyncEvent.findFirst").where).toEqual({
      errorCode: "CONFLICT",
      eventId: "event_credit_conflict",
      reviewedAt: null,
      status: "FAILED",
      tenantId: "tenant_123",
    })
    expect(getCall(db.calls, "retailOpsSyncEvent.update")).toMatchObject({
      data: {
        reviewedByUserId: "user_manager",
      },
      where: {
        id: "sync_event_123",
      },
    })
  })
})
