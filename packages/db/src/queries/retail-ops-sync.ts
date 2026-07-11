import { randomUUID } from "node:crypto"
import { Prisma } from "../generated/prisma/client"
import {
  RetailOpsSyncEventStatus as DurableRetailOpsSyncEventStatus,
  RetailOpsSyncRunStatus as DurableRetailOpsSyncRunStatus,
} from "../generated/prisma/enums"
import type { DbClient } from "./types"

export type RetailOpsSyncRunEventStatus = "applied" | "failed" | "skipped"
export type RetailOpsSyncRunStatus = "failed" | "partial" | "skipped" | "succeeded"

export type RetailOpsSyncRunEvent = {
  errorCode: string | null
  errorMessage: string | null
  eventId: string
  status: RetailOpsSyncRunEventStatus
  type: string
}

export type RetailOpsSyncRun = {
  actorUserId: string
  appliedCount: number
  completedAt: string
  deviceId: string | null
  events: RetailOpsSyncRunEvent[]
  failedCount: number
  id: string
  skippedCount: number
  status: RetailOpsSyncRunStatus
  totalCount: number
}

export type RetailOpsSyncConflictEvent = {
  actorUserId: string | null
  deviceId: string | null
  errorCode: string | null
  errorMessage: string | null
  eventId: string
  id: string
  processedAt: string | null
  resolutionAction: string
  resolutionDetail: string
  reviewedAt: string | null
  reviewedByUserId: string | null
  syncRunId: string | null
  type: string
}

type JsonRecord = Record<string, unknown>

const MAX_SYNC_RUNS = 50
const MAX_SYNC_RUN_EVENTS = 50
const MAX_REVIEWED_SYNC_EVENT_IDS = 500

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeIsoDate(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function normalizeSyncEventStatus(
  value: unknown,
): RetailOpsSyncRunEventStatus | null {
  const status = getStringField(value)

  if (status === "applied" || status === "failed" || status === "skipped") {
    return status
  }

  return null
}

function normalizeSyncRunStatus(value: unknown): RetailOpsSyncRunStatus | null {
  const status = getStringField(value)

  if (
    status === "failed" ||
    status === "partial" ||
    status === "skipped" ||
    status === "succeeded"
  ) {
    return status
  }

  return null
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function getRetailOpsSyncConflictResolution(input: {
  errorMessage: string | null
  type: string
}) {
  const normalizedMessage = input.errorMessage?.toLowerCase() ?? ""

  if (
    input.type === "sale_created" ||
    normalizedMessage.includes("stock") ||
    normalizedMessage.includes("inventory")
  ) {
    return {
      resolutionAction: "Review stock, then retry",
      resolutionDetail:
        "Compare the offline sale or stock event with current inventory. Adjust stock if the offline count is valid, then move the device event back to pending and replay it.",
    }
  }

  if (
    input.type === "rep_session_opened" ||
    normalizedMessage.includes("open session")
  ) {
    return {
      resolutionAction: "Resolve the active session",
      resolutionDetail:
        "Check whether this attendant already has an open session. Close or reconcile the existing session before retrying the offline clock-in.",
    }
  }

  if (
    input.type === "closeout_created" ||
    normalizedMessage.includes("closed session")
  ) {
    return {
      resolutionAction: "Review session closeout",
      resolutionDetail:
        "Confirm the session is still open and all sales for the rep synced first. Reopen the local closeout for correction or retry it after dependencies are applied.",
    }
  }

  if (
    input.type === "customer_upsert" ||
    normalizedMessage.includes("sale exists")
  ) {
    return {
      resolutionAction: "Sync the linked sale first",
      resolutionDetail:
        "The customer update depends on a sale record. Make sure the referenced sale event has synced, then retry the customer event.",
    }
  }

  if (input.type === "product_setup") {
    return {
      resolutionAction: "Review catalog setup",
      resolutionDetail:
        "Check product limits, duplicate setup, and unit details. Update the catalog or subscription limit before retrying the product setup event.",
    }
  }

  if (input.type === "staff_invited") {
    return {
      resolutionAction: "Review staff access",
      resolutionDetail:
        "Check whether the staff member already exists or the plan limit is reached. Update staff access, then retry the invite if it is still needed.",
    }
  }

  if (
    input.type === "share_link_created" ||
    input.type === "share_link_deactivated"
  ) {
    return {
      resolutionAction: "Review product link state",
      resolutionDetail:
        "Confirm the product and generated link still exist. Recreate or deactivate the current production link, then acknowledge the conflict.",
    }
  }

  if (input.type === "credit_payment_recorded") {
    return {
      resolutionAction: "Review credit sale",
      resolutionDetail:
        "Confirm the credit sale/order exists and is still unpaid. Record the payment against the current credit sale or retry after the sale syncs.",
    }
  }

  return {
    resolutionAction: "Review and retry manually",
    resolutionDetail:
      "Read the conflict message, correct the source record or dependency, then retry the local event. Acknowledge only after the business action is resolved.",
  }
}

function getRetailOpsReviewedSyncEventIds(metadata: unknown) {
  const eventIds = getRetailOpsMetadata(metadata).reviewedSyncEventIds

  if (!Array.isArray(eventIds)) return []

  return eventIds.flatMap((eventId) => {
    const normalizedEventId = getStringField(eventId)

    return normalizedEventId ? [normalizedEventId] : []
  })
}

function withRetailOpsReviewedSyncEventIds(
  metadata: unknown,
  eventIds: string[],
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      reviewedSyncEventIds: eventIds,
    },
  } as Prisma.InputJsonValue
}

function isDurableSyncTableUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

function getSyncRunStatus(input: {
  appliedCount: number
  failedCount: number
  skippedCount: number
  totalCount: number
}): RetailOpsSyncRunStatus {
  if (input.failedCount >= input.totalCount) return "failed"
  if (input.failedCount > 0) return "partial"
  if (input.appliedCount === 0 && input.skippedCount > 0) return "skipped"

  return "succeeded"
}

function toDurableSyncRunStatus(status: RetailOpsSyncRunStatus) {
  if (status === "failed") return DurableRetailOpsSyncRunStatus.FAILED
  if (status === "partial") return DurableRetailOpsSyncRunStatus.PARTIAL
  if (status === "skipped") return DurableRetailOpsSyncRunStatus.SKIPPED

  return DurableRetailOpsSyncRunStatus.SUCCEEDED
}

function fromDurableSyncRunStatus(value: string) {
  if (value === DurableRetailOpsSyncRunStatus.FAILED) return "failed"
  if (value === DurableRetailOpsSyncRunStatus.PARTIAL) return "partial"
  if (value === DurableRetailOpsSyncRunStatus.SKIPPED) return "skipped"
  if (value === DurableRetailOpsSyncRunStatus.SUCCEEDED) return "succeeded"

  return null
}

function toDurableSyncEventStatus(status: RetailOpsSyncRunEventStatus) {
  if (status === "failed") return DurableRetailOpsSyncEventStatus.FAILED
  if (status === "skipped") return DurableRetailOpsSyncEventStatus.SKIPPED

  return DurableRetailOpsSyncEventStatus.APPLIED
}

function fromDurableSyncEventStatus(value: string) {
  if (value === DurableRetailOpsSyncEventStatus.APPLIED) return "applied"
  if (value === DurableRetailOpsSyncEventStatus.FAILED) return "failed"
  if (value === DurableRetailOpsSyncEventStatus.SKIPPED) return "skipped"

  return null
}

function getRetailOpsSyncRuns(metadata: unknown): RetailOpsSyncRun[] {
  const syncRuns = getRetailOpsMetadata(metadata).syncRuns

  if (!Array.isArray(syncRuns)) return []

  return syncRuns.flatMap((syncRun) => {
    const record = asRecord(syncRun)
    const id = getStringField(record.id)
    const actorUserId = getStringField(record.actorUserId)
    const completedAt = normalizeIsoDate(record.completedAt)
    const status = normalizeSyncRunStatus(record.status)
    const totalCount = getNumberField(record.totalCount)
    const appliedCount = getNumberField(record.appliedCount)
    const failedCount = getNumberField(record.failedCount)
    const skippedCount = getNumberField(record.skippedCount)

    if (
      !id ||
      !actorUserId ||
      !completedAt ||
      !status ||
      totalCount === null ||
      appliedCount === null ||
      failedCount === null ||
      skippedCount === null
    ) {
      return []
    }

    const events = Array.isArray(record.events)
      ? record.events.flatMap((event): RetailOpsSyncRunEvent[] => {
          const eventRecord = asRecord(event)
          const eventId = getStringField(eventRecord.eventId)
          const type = getStringField(eventRecord.type)
          const eventStatus = normalizeSyncEventStatus(eventRecord.status)

          if (!eventId || !type || !eventStatus) return []

          return [
            {
              errorCode: getStringField(eventRecord.errorCode),
              errorMessage: getStringField(eventRecord.errorMessage),
              eventId,
              status: eventStatus,
              type,
            },
          ]
        })
      : []

    return [
      {
        actorUserId,
        appliedCount,
        completedAt,
        deviceId: getStringField(record.deviceId),
        events,
        failedCount,
        id,
        skippedCount,
        status,
        totalCount,
      },
    ]
  })
}

function withRetailOpsSyncRuns(
  metadata: unknown,
  syncRuns: RetailOpsSyncRun[],
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      syncRuns,
    },
  } as Prisma.InputJsonValue
}

async function listMetadataRetailOpsSyncRuns(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncRun[]> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })

  return getRetailOpsSyncRuns(tenant.metadata)
    .filter((syncRun) =>
      input.actorUserId ? syncRun.actorUserId === input.actorUserId : true,
    )
    .filter((syncRun) =>
      input.deviceId ? syncRun.deviceId === input.deviceId : true,
    )
    .sort(
      (left, right) =>
        new Date(right.completedAt).getTime() -
        new Date(left.completedAt).getTime(),
    )
    .slice(0, input.limit)
}

function mapMetadataRetailOpsSyncConflict(input: {
  event: RetailOpsSyncRunEvent
  reviewedAt?: string | null
  reviewedByUserId?: string | null
  syncRun: RetailOpsSyncRun
}): RetailOpsSyncConflictEvent {
  const resolution = getRetailOpsSyncConflictResolution({
    errorMessage: input.event.errorMessage,
    type: input.event.type,
  })

  return {
    actorUserId: input.syncRun.actorUserId,
    deviceId: input.syncRun.deviceId,
    errorCode: input.event.errorCode,
    errorMessage: input.event.errorMessage,
    eventId: input.event.eventId,
    id: `metadata:${input.syncRun.id}:${input.event.eventId}`,
    processedAt: input.syncRun.completedAt,
    ...resolution,
    reviewedAt: input.reviewedAt ?? null,
    reviewedByUserId: input.reviewedByUserId ?? null,
    syncRunId: input.syncRun.id,
    type: input.event.type,
  }
}

function getMetadataRetailOpsSyncConflicts(
  metadata: unknown,
  input: {
    actorUserId?: string
    deviceId?: string
    eventId?: string
    limit: number
  },
) {
  const reviewedEventIds = new Set(getRetailOpsReviewedSyncEventIds(metadata))

  return getRetailOpsSyncRuns(metadata)
    .filter((syncRun) =>
      input.actorUserId ? syncRun.actorUserId === input.actorUserId : true,
    )
    .filter((syncRun) =>
      input.deviceId ? syncRun.deviceId === input.deviceId : true,
    )
    .flatMap((syncRun) =>
      syncRun.events.flatMap((event) => {
        if (event.status !== "failed" || event.errorCode !== "CONFLICT") {
          return []
        }

        if (input.eventId && event.eventId !== input.eventId) return []
        if (reviewedEventIds.has(event.eventId)) return []

        return [
          mapMetadataRetailOpsSyncConflict({
            event,
            syncRun,
          }),
        ]
      }),
    )
    .sort(
      (left, right) =>
        new Date(right.processedAt ?? 0).getTime() -
        new Date(left.processedAt ?? 0).getTime(),
    )
    .slice(0, input.limit)
}

async function listMetadataRetailOpsSyncConflicts(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent[]> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })

  return getMetadataRetailOpsSyncConflicts(tenant.metadata, input)
}

async function reviewMetadataRetailOpsSyncConflict(
  db: DbClient,
  input: {
    eventId: string
    reviewedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent | null> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const [conflict] = getMetadataRetailOpsSyncConflicts(tenant.metadata, {
    eventId: input.eventId,
    limit: 1,
  })

  if (!conflict) return null

  const reviewedAt = new Date().toISOString()
  const reviewedEventIds = [
    input.eventId,
    ...getRetailOpsReviewedSyncEventIds(tenant.metadata).filter(
      (eventId) => eventId !== input.eventId,
    ),
  ].slice(0, MAX_REVIEWED_SYNC_EVENT_IDS)

  await db.tenant.update({
    where: {
      id: input.tenantId,
    },
    data: {
      metadata: withRetailOpsReviewedSyncEventIds(
        tenant.metadata,
        reviewedEventIds,
      ),
    },
    select: {
      id: true,
    },
  })

  return {
    ...conflict,
    reviewedAt,
    reviewedByUserId: input.reviewedByUserId,
  }
}

function buildRetailOpsSyncRun(input: {
  actorUserId: string
  completedAt: Date
  deviceId?: string | null
  id: string
  results: Array<{
    error?: {
      code: string
      message: string
    }
    eventId: string
    status: RetailOpsSyncRunEventStatus
    type: string
  }>
}) {
  const totalCount = input.results.length
  const appliedCount = input.results.filter(
    (result) => result.status === "applied",
  ).length
  const failedCount = input.results.filter(
    (result) => result.status === "failed",
  ).length
  const skippedCount = input.results.filter(
    (result) => result.status === "skipped",
  ).length

  return {
    actorUserId: input.actorUserId,
    appliedCount,
    completedAt: input.completedAt.toISOString(),
    deviceId: input.deviceId?.trim() || null,
    events: input.results.slice(0, MAX_SYNC_RUN_EVENTS).map((result) => ({
      errorCode: result.error?.code ?? null,
      errorMessage: result.error?.message ?? null,
      eventId: result.eventId,
      status: result.status,
      type: result.type,
    })),
    failedCount,
    id: input.id,
    skippedCount,
    status: getSyncRunStatus({
      appliedCount,
      failedCount,
      skippedCount,
      totalCount,
    }),
    totalCount,
  }
}

function mapDurableRetailOpsSyncRun(syncRun: {
  actorUserId: string | null
  appliedCount: number
  completedAt: Date | null
  deviceId: string | null
  events: Array<{
    errorCode: string | null
    errorMessage: string | null
    eventId: string
    status: string
    type: string
  }>
  failedCount: number
  id: string
  skippedCount: number
  status: string
  totalCount: number
}): RetailOpsSyncRun | null {
  const status = fromDurableSyncRunStatus(syncRun.status)

  if (!syncRun.actorUserId || !syncRun.completedAt || !status) return null

  return {
    actorUserId: syncRun.actorUserId,
    appliedCount: syncRun.appliedCount,
    completedAt: syncRun.completedAt.toISOString(),
    deviceId: syncRun.deviceId,
    events: syncRun.events.flatMap((event) => {
      const eventStatus = fromDurableSyncEventStatus(event.status)

      return eventStatus
        ? [
            {
              errorCode: event.errorCode,
              errorMessage: event.errorMessage,
              eventId: event.eventId,
              status: eventStatus,
              type: event.type,
            },
          ]
        : []
    }),
    failedCount: syncRun.failedCount,
    id: syncRun.id,
    skippedCount: syncRun.skippedCount,
    status,
    totalCount: syncRun.totalCount,
  }
}

function mapDurableRetailOpsSyncConflict(event: {
  actorUserId: string | null
  deviceId: string | null
  errorCode: string | null
  errorMessage: string | null
  eventId: string
  id: string
  processedAt: Date | null
  reviewedAt: Date | null
  reviewedByUserId: string | null
  syncRunId: string | null
  type: string
}): RetailOpsSyncConflictEvent {
  const resolution = getRetailOpsSyncConflictResolution({
    errorMessage: event.errorMessage,
    type: event.type,
  })

  return {
    actorUserId: event.actorUserId,
    deviceId: event.deviceId,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage,
    eventId: event.eventId,
    id: event.id,
    processedAt: event.processedAt?.toISOString() ?? null,
    ...resolution,
    reviewedAt: event.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: event.reviewedByUserId,
    syncRunId: event.syncRunId,
    type: event.type,
  }
}

async function listDurableRetailOpsSyncRuns(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncRun[]> {
  const syncRuns = await db.retailOpsSyncRun.findMany({
    include: {
      events: {
        orderBy: {
          createdAt: "asc",
        },
        take: MAX_SYNC_RUN_EVENTS,
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    take: input.limit,
    where: {
      actorUserId: input.actorUserId,
      deviceId: input.deviceId,
      tenantId: input.tenantId,
    },
  })

  return syncRuns.flatMap((syncRun) => {
    const mappedSyncRun = mapDurableRetailOpsSyncRun(syncRun)

    return mappedSyncRun ? [mappedSyncRun] : []
  })
}

async function listDurableRetailOpsSyncConflicts(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent[]> {
  const events = await db.retailOpsSyncEvent.findMany({
    orderBy: {
      processedAt: "desc",
    },
    select: {
      actorUserId: true,
      deviceId: true,
      errorCode: true,
      errorMessage: true,
      eventId: true,
      id: true,
      processedAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      syncRunId: true,
      type: true,
    },
    take: input.limit,
    where: {
      actorUserId: input.actorUserId,
      deviceId: input.deviceId,
      errorCode: "CONFLICT",
      reviewedAt: null,
      status: DurableRetailOpsSyncEventStatus.FAILED,
      tenantId: input.tenantId,
    },
  })

  return events.map(mapDurableRetailOpsSyncConflict)
}

async function reviewDurableRetailOpsSyncConflict(
  db: DbClient,
  input: {
    eventId: string
    reviewedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent | null> {
  const event = await db.retailOpsSyncEvent.findFirst({
    where: {
      errorCode: "CONFLICT",
      eventId: input.eventId,
      reviewedAt: null,
      status: DurableRetailOpsSyncEventStatus.FAILED,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
    },
  })

  if (!event) return null

  const reviewedAt = new Date()
  const reviewedEvent = await db.retailOpsSyncEvent.update({
    where: {
      id: event.id,
    },
    data: {
      reviewedAt,
      reviewedByUserId: input.reviewedByUserId,
    },
    select: {
      actorUserId: true,
      deviceId: true,
      errorCode: true,
      errorMessage: true,
      eventId: true,
      id: true,
      processedAt: true,
      reviewedAt: true,
      reviewedByUserId: true,
      syncRunId: true,
      type: true,
    },
  })

  return mapDurableRetailOpsSyncConflict(reviewedEvent)
}

async function recordMetadataRetailOpsSyncRun(
  db: DbClient,
  input: {
    actorUserId: string
    deviceId?: string | null
    results: Array<{
      error?: {
        code: string
        message: string
      }
      eventId: string
      status: RetailOpsSyncRunEventStatus
      type: string
    }>
    tenantId: string
  },
): Promise<RetailOpsSyncRun> {
  const tenant = await db.tenant.findFirstOrThrow({
    where: {
      id: input.tenantId,
      isActive: true,
    },
    select: {
      metadata: true,
    },
  })
  const syncRun = buildRetailOpsSyncRun({
    ...input,
    completedAt: new Date(),
    id: randomUUID(),
  })
  const syncRuns = [syncRun, ...getRetailOpsSyncRuns(tenant.metadata)].slice(
    0,
    MAX_SYNC_RUNS,
  )

  await db.tenant.update({
    where: {
      id: input.tenantId,
    },
    data: {
      metadata: withRetailOpsSyncRuns(tenant.metadata, syncRuns),
    },
    select: {
      id: true,
    },
  })

  return syncRun
}

async function recordDurableRetailOpsSyncRun(
  db: DbClient,
  input: {
    actorUserId: string
    deviceId?: string | null
    results: Array<{
      error?: {
        code: string
        message: string
      }
      eventId: string
      status: RetailOpsSyncRunEventStatus
      type: string
    }>
    tenantId: string
  },
): Promise<RetailOpsSyncRun> {
  const completedAt = new Date()
  const syncRun = buildRetailOpsSyncRun({
    ...input,
    completedAt,
    id: randomUUID(),
  })
  const offlineDevice = syncRun.deviceId
    ? await db.offlineDevice.findFirst({
        select: {
          id: true,
          storeId: true,
        },
        where: {
          deviceId: syncRun.deviceId,
          tenantId: input.tenantId,
        },
      })
    : null
  const durableSyncRun = await db.retailOpsSyncRun.create({
    data: {
      actorUserId: input.actorUserId,
      appliedCount: syncRun.appliedCount,
      completedAt,
      deviceId: syncRun.deviceId,
      failedCount: syncRun.failedCount,
      offlineDeviceId: offlineDevice?.id ?? null,
      skippedCount: syncRun.skippedCount,
      startedAt: completedAt,
      status: toDurableSyncRunStatus(syncRun.status),
      storeId: offlineDevice?.storeId ?? null,
      tenantId: input.tenantId,
      totalCount: syncRun.totalCount,
    },
    select: {
      id: true,
    },
  })

  for (const result of input.results.slice(0, MAX_SYNC_RUN_EVENTS)) {
    await db.retailOpsSyncEvent.upsert({
      create: {
        actorUserId: input.actorUserId,
        deviceId: syncRun.deviceId,
        errorCode: result.error?.code ?? null,
        errorMessage: result.error?.message ?? null,
        eventId: result.eventId,
        offlineDeviceId: offlineDevice?.id ?? null,
        processedAt: completedAt,
        status: toDurableSyncEventStatus(result.status),
        storeId: offlineDevice?.storeId ?? null,
        syncRunId: durableSyncRun.id,
        tenantId: input.tenantId,
        type: result.type,
      },
      update: {
        actorUserId: input.actorUserId,
        deviceId: syncRun.deviceId,
        errorCode: result.error?.code ?? null,
        errorMessage: result.error?.message ?? null,
        offlineDeviceId: offlineDevice?.id ?? null,
        processedAt: completedAt,
        status: toDurableSyncEventStatus(result.status),
        storeId: offlineDevice?.storeId ?? null,
        syncRunId: durableSyncRun.id,
        type: result.type,
      },
      where: {
        tenantId_eventId: {
          eventId: result.eventId,
          tenantId: input.tenantId,
        },
      },
    })
  }

  return {
    ...syncRun,
    id: durableSyncRun.id,
  }
}

export async function listRetailOpsSyncRuns(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncRun[]> {
  try {
    const durableSyncRuns = await listDurableRetailOpsSyncRuns(db, input)
    const metadataSyncRuns = await listMetadataRetailOpsSyncRuns(db, input)

    return [...durableSyncRuns, ...metadataSyncRuns]
      .sort(
        (left, right) =>
          new Date(right.completedAt).getTime() -
          new Date(left.completedAt).getTime(),
      )
      .slice(0, input.limit)
  } catch (error) {
    if (isDurableSyncTableUnavailable(error)) {
      return listMetadataRetailOpsSyncRuns(db, input)
    }

    throw error
  }
}

export async function listRetailOpsSyncConflicts(
  db: DbClient,
  input: {
    actorUserId?: string
    deviceId?: string
    limit: number
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent[]> {
  try {
    const durableConflicts = await listDurableRetailOpsSyncConflicts(db, input)
    const metadataConflicts = await listMetadataRetailOpsSyncConflicts(
      db,
      input,
    )

    return [...durableConflicts, ...metadataConflicts]
      .sort(
        (left, right) =>
          new Date(right.processedAt ?? 0).getTime() -
          new Date(left.processedAt ?? 0).getTime(),
      )
      .slice(0, input.limit)
  } catch (error) {
    if (isDurableSyncTableUnavailable(error)) {
      return listMetadataRetailOpsSyncConflicts(db, input)
    }

    throw error
  }
}

export async function reviewRetailOpsSyncConflict(
  db: DbClient,
  input: {
    eventId: string
    reviewedByUserId: string
    tenantId: string
  },
): Promise<RetailOpsSyncConflictEvent | null> {
  try {
    const durableConflict = await reviewDurableRetailOpsSyncConflict(db, input)

    if (durableConflict) return durableConflict

    return reviewMetadataRetailOpsSyncConflict(db, input)
  } catch (error) {
    if (isDurableSyncTableUnavailable(error)) {
      return reviewMetadataRetailOpsSyncConflict(db, input)
    }

    throw error
  }
}

export async function recordRetailOpsSyncRun(
  db: DbClient,
  input: {
    actorUserId: string
    deviceId?: string | null
    results: Array<{
      error?: {
        code: string
        message: string
      }
      eventId: string
      status: RetailOpsSyncRunEventStatus
      type: string
    }>
    tenantId: string
  },
): Promise<RetailOpsSyncRun> {
  try {
    return await recordDurableRetailOpsSyncRun(db, input)
  } catch (error) {
    if (isDurableSyncTableUnavailable(error)) {
      return recordMetadataRetailOpsSyncRun(db, input)
    }

    throw error
  }
}
