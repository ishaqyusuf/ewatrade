import {
  DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
  type StoreConversationAvailabilitySettingsProjection,
  storeConversationAvailabilityScheduleCommandSchema,
  storeConversationManualPauseCommandSchema,
  storeConversationWeeklyHoursSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  StoreConversationAvailabilityAuditEventType,
  StoreConversationCustomerWording,
} from "../../generated/prisma/enums"
import { storeConversationPayloadHash } from "./store-conversations-core"
import type { DbClient } from "./types"

export type StoreConversationAvailabilityErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"

export class StoreConversationAvailabilityError extends Error {
  constructor(
    readonly code: StoreConversationAvailabilityErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationAvailabilityError"
  }
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

function customerWording(value: StoreConversationCustomerWording) {
  return value === StoreConversationCustomerWording.OUTSIDE_SERVICE_HOURS
    ? ("outside_service_hours" as const)
    : ("temporarily_unavailable" as const)
}

function databaseCustomerWording(
  value: "outside_service_hours" | "temporarily_unavailable",
) {
  return value === "outside_service_hours"
    ? StoreConversationCustomerWording.OUTSIDE_SERVICE_HOURS
    : StoreConversationCustomerWording.TEMPORARILY_UNAVAILABLE
}

export function projectStoredStoreConversationAvailabilityConfiguration(input: {
  customerWording: StoreConversationCustomerWording
  manualPaused: boolean
  pausedAt: Date | null
  revision: number
  timezone: string
  unreadNotificationGraceSeconds: number
  weeklyHours: Prisma.JsonValue
}): StoreConversationAvailabilitySettingsProjection {
  const weeklyHours = storeConversationWeeklyHoursSchema.safeParse(
    input.weeklyHours,
  )
  if (!weeklyHours.success) {
    throw new StoreConversationAvailabilityError(
      "NOT_READY",
      "Store conversation availability must be reconfigured.",
    )
  }
  return {
    customerWording: customerWording(input.customerWording),
    manualPaused: input.manualPaused,
    pausedAt: input.pausedAt,
    revision: input.revision,
    timezone: input.timezone,
    unreadNotificationGraceSeconds: input.unreadNotificationGraceSeconds,
    weeklyHours: weeklyHours.data,
  }
}

async function requireStoreManager(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const [membership, store] = await Promise.all([
    db.membership.findFirst({
      select: { id: true },
      where: {
        acceptedAt: { not: null },
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    }),
    db.store.findFirst({
      select: { id: true, tenant: { select: { timezone: true } } },
      where: {
        id: input.storeId,
        status: "ACTIVE",
        tenantId: input.tenantId,
      },
    }),
  ])
  if (!membership) {
    throw new StoreConversationAvailabilityError(
      "FORBIDDEN",
      "Owner or administrator access is required.",
    )
  }
  if (!store) {
    throw new StoreConversationAvailabilityError(
      "NOT_FOUND",
      "Store not found.",
    )
  }
  return store
}

export function getStoreConversationAvailabilityCompatibilitySettings(
  timezone: string,
) {
  return {
    customerWording: "temporarily_unavailable" as const,
    manualPaused: false,
    pausedAt: null,
    revision: 0,
    timezone,
    unreadNotificationGraceSeconds: 45,
    weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
  }
}

export async function loadStoreConversationAvailabilityConfiguration(
  db: DbClient,
  input: { storeId: string; tenantId: string },
): Promise<StoreConversationAvailabilitySettingsProjection> {
  const store = await db.store.findFirst({
    select: {
      storeConversationAvailabilityConfiguration: true,
      tenant: { select: { timezone: true } },
    },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) {
    throw new StoreConversationAvailabilityError(
      "NOT_FOUND",
      "Store not found.",
    )
  }
  return store.storeConversationAvailabilityConfiguration
    ? projectStoredStoreConversationAvailabilityConfiguration(
        store.storeConversationAvailabilityConfiguration,
      )
    : getStoreConversationAvailabilityCompatibilitySettings(
        store.tenant.timezone,
      )
}

export async function getStoreConversationAvailabilitySettings(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  await requireStoreManager(db, input)
  return loadStoreConversationAvailabilityConfiguration(db, input)
}

function snapshotJson(
  projection: StoreConversationAvailabilitySettingsProjection,
): Prisma.InputJsonObject {
  return {
    customerWording: projection.customerWording,
    manualPaused: projection.manualPaused,
    pausedAt: projection.pausedAt?.toISOString() ?? null,
    revision: projection.revision,
    timezone: projection.timezone,
    unreadNotificationGraceSeconds: projection.unreadNotificationGraceSeconds,
    weeklyHours: projection.weeklyHours.map((interval) => ({ ...interval })),
  }
}

function projectSnapshot(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new StoreConversationAvailabilityError(
      "NOT_READY",
      "Store conversation availability history is unavailable.",
    )
  }
  const record = value as Record<string, unknown>
  const parsedHours = storeConversationWeeklyHoursSchema.safeParse(
    record.weeklyHours,
  )
  if (
    !parsedHours.success ||
    typeof record.timezone !== "string" ||
    typeof record.revision !== "number" ||
    typeof record.manualPaused !== "boolean" ||
    typeof record.unreadNotificationGraceSeconds !== "number" ||
    record.unreadNotificationGraceSeconds < 30 ||
    record.unreadNotificationGraceSeconds > 60 ||
    (record.customerWording !== "outside_service_hours" &&
      record.customerWording !== "temporarily_unavailable")
  ) {
    throw new StoreConversationAvailabilityError(
      "NOT_READY",
      "Store conversation availability history is unavailable.",
    )
  }
  return {
    customerWording: record.customerWording,
    manualPaused: record.manualPaused,
    pausedAt:
      typeof record.pausedAt === "string" ? new Date(record.pausedAt) : null,
    revision: record.revision,
    timezone: record.timezone,
    unreadNotificationGraceSeconds: record.unreadNotificationGraceSeconds,
    weeklyHours: parsedHours.data,
  } satisfies StoreConversationAvailabilitySettingsProjection
}

async function replayAvailabilityCommand(
  db: DbClient,
  input: { clientOperationId: string; payloadHash: string; storeId: string },
) {
  const event = await db.storeConversationAvailabilityAuditEvent.findUnique({
    select: { configurationSnapshot: true, payloadHash: true },
    where: {
      storeId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        storeId: input.storeId,
      },
    },
  })
  if (!event) return null
  if (event.payloadHash !== input.payloadHash) {
    throw new StoreConversationAvailabilityError(
      "CONFLICT",
      "This availability command was already used with different details.",
    )
  }
  return { ...projectSnapshot(event.configurationSnapshot), replayed: true }
}

function translateWriteError(error: unknown): never {
  if (error instanceof StoreConversationAvailabilityError) throw error
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new StoreConversationAvailabilityError(
      "CONFLICT",
      "Availability changed. Refresh and try again.",
    )
  }
  throw error
}

export async function updateStoreConversationAvailabilitySchedule(
  db: PrismaClient,
  rawInput: {
    actorUserId: string
    clientOperationId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
    timezone: string
    unreadNotificationGraceSeconds: number
    weeklyHours: Array<{
      dayOfWeek: number
      endMinute: number
      startMinute: number
    }>
  },
) {
  const input = storeConversationAvailabilityScheduleCommandSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    expectedRevision: rawInput.expectedRevision,
    reason: rawInput.reason,
    storeId: rawInput.storeId,
    timezone: rawInput.timezone,
    unreadNotificationGraceSeconds: rawInput.unreadNotificationGraceSeconds,
    weeklyHours: rawInput.weeklyHours,
  })
  const payloadHash = storeConversationPayloadHash({
    ...input,
    actorUserId: rawInput.actorUserId,
    tenantId: rawInput.tenantId,
  })
  try {
    return await db.$transaction(async (tx) => {
      await requireStoreManager(tx, rawInput)
      const replay = await replayAvailabilityCommand(tx, {
        clientOperationId: input.clientOperationId,
        payloadHash,
        storeId: input.storeId,
      })
      if (replay) return replay
      const existing =
        await tx.storeConversationAvailabilityConfiguration.findUnique({
          where: { storeId: input.storeId },
        })
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new StoreConversationAvailabilityError(
          "CONFLICT",
          "Availability changed. Refresh and try again.",
        )
      }
      const configuration = existing
        ? await tx.storeConversationAvailabilityConfiguration.update({
            data: {
              revision: { increment: 1 },
              timezone: input.timezone,
              unreadNotificationGraceSeconds:
                input.unreadNotificationGraceSeconds,
              weeklyHours: input.weeklyHours,
            },
            where: { id: existing.id },
          })
        : await tx.storeConversationAvailabilityConfiguration.create({
            data: {
              storeId: input.storeId,
              tenantId: rawInput.tenantId,
              timezone: input.timezone,
              unreadNotificationGraceSeconds:
                input.unreadNotificationGraceSeconds,
              weeklyHours: input.weeklyHours,
            },
          })
      const projection =
        projectStoredStoreConversationAvailabilityConfiguration(configuration)
      await tx.storeConversationAvailabilityAuditEvent.create({
        data: {
          actorUserId: rawInput.actorUserId,
          clientOperationId: input.clientOperationId,
          configurationId: configuration.id,
          configurationRevision: projection.revision,
          configurationSnapshot: snapshotJson(projection),
          payloadHash,
          reason: input.reason,
          storeId: input.storeId,
          tenantId: rawInput.tenantId,
          type: StoreConversationAvailabilityAuditEventType.SCHEDULE_UPDATED,
        },
      })
      return { ...projection, replayed: false }
    }, transactionOptions)
  } catch (error) {
    translateWriteError(error)
  }
}

export async function setStoreConversationManualPause(
  db: PrismaClient,
  rawInput: {
    actorUserId: string
    clientOperationId: string
    customerWording: "outside_service_hours" | "temporarily_unavailable"
    expectedRevision: number
    paused: boolean
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const input = storeConversationManualPauseCommandSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    customerWording: rawInput.customerWording,
    expectedRevision: rawInput.expectedRevision,
    paused: rawInput.paused,
    reason: rawInput.reason,
    storeId: rawInput.storeId,
  })
  const payloadHash = storeConversationPayloadHash({
    ...input,
    actorUserId: rawInput.actorUserId,
    tenantId: rawInput.tenantId,
  })
  try {
    return await db.$transaction(async (tx) => {
      const store = await requireStoreManager(tx, rawInput)
      const replay = await replayAvailabilityCommand(tx, {
        clientOperationId: input.clientOperationId,
        payloadHash,
        storeId: input.storeId,
      })
      if (replay) return replay
      const existing =
        await tx.storeConversationAvailabilityConfiguration.findUnique({
          where: { storeId: input.storeId },
        })
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new StoreConversationAvailabilityError(
          "CONFLICT",
          "Availability changed. Refresh and try again.",
        )
      }
      const now = new Date()
      const nextWording = databaseCustomerWording(input.customerWording)
      const configuration = existing
        ? await tx.storeConversationAvailabilityConfiguration.update({
            data: {
              customerWording: nextWording,
              manualPaused: input.paused,
              pauseReason: input.paused ? input.reason : null,
              pausedAt: input.paused ? now : null,
              pausedByUserId: input.paused ? rawInput.actorUserId : null,
              resumedAt: input.paused ? null : now,
              resumedByUserId: input.paused ? null : rawInput.actorUserId,
              revision: { increment: 1 },
            },
            where: { id: existing.id },
          })
        : await tx.storeConversationAvailabilityConfiguration.create({
            data: {
              customerWording: nextWording,
              manualPaused: input.paused,
              pauseReason: input.paused ? input.reason : null,
              pausedAt: input.paused ? now : null,
              pausedByUserId: input.paused ? rawInput.actorUserId : null,
              resumedAt: input.paused ? null : now,
              resumedByUserId: input.paused ? null : rawInput.actorUserId,
              storeId: input.storeId,
              tenantId: rawInput.tenantId,
              timezone: store.tenant.timezone,
              weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
            },
          })
      const projection =
        projectStoredStoreConversationAvailabilityConfiguration(configuration)
      await tx.storeConversationAvailabilityAuditEvent.create({
        data: {
          actorUserId: rawInput.actorUserId,
          clientOperationId: input.clientOperationId,
          configurationId: configuration.id,
          configurationRevision: projection.revision,
          configurationSnapshot: snapshotJson(projection),
          payloadHash,
          reason: input.reason,
          storeId: input.storeId,
          tenantId: rawInput.tenantId,
          type: input.paused
            ? StoreConversationAvailabilityAuditEventType.PAUSED
            : StoreConversationAvailabilityAuditEventType.RESUMED,
        },
      })
      return { ...projection, replayed: false }
    }, transactionOptions)
  } catch (error) {
    translateWriteError(error)
  }
}
