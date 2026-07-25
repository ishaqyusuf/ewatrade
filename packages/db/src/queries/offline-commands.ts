import { createHash } from "node:crypto"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  OfflineCommandStatus,
  OfflineCommandType,
  OfflineConflictCode,
  OfflineDeviceStatus,
  OfflineReviewDecision,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { createCommercialOrder } from "./commercial-orders"

type CommercialOrderPayload = {
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  discountMinor?: number
  initialPayment?: {
    amountMinor: number
    clientPaymentId: string
    method: "bank_transfer" | "card" | "cash" | "other" | "pos"
    note?: string
    reference?: string
  }
  kind: "commercial_order"
  lines: Array<{
    approvedQuotePriceMinor?: number
    expectedBalanceRevision?: number
    expectedConfigurationVersionId?: string
    expectedFixedPriceMinor?: number
    offeringId: string
    quantity: string
  }>
  notes?: string
  taxMinor?: number
}

export type OfflineCommandPayload = CommercialOrderPayload

export type OfflineCommandEnvelope = {
  clientCommandId: string
  createdAtClient: Date
  dependencyClientIds: string[]
  eventVersion: number
  payload: OfflineCommandPayload
}

export type ReplayOfflineCommandsInput = {
  actorUserId: string
  capabilities: {
    operateOrders: boolean
  }
  commands: OfflineCommandEnvelope[]
  deviceId: string
  storeId: string
  tenantId: string
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function commandType(_payload: OfflineCommandPayload) {
  return OfflineCommandType.COMMERCIAL_ORDER
}

function conflictCode(error: CatalogError) {
  if (error.code === "STALE_CONFIGURATION") {
    return OfflineConflictCode.STALE_CONFIGURATION
  }
  if (error.code === "OFFERING_UNAVAILABLE") {
    return OfflineConflictCode.OFFERING_OR_PRICE_CHANGED
  }
  if (error.code === "REVISION_CONFLICT") {
    return OfflineConflictCode.BALANCE_REVISION_CHANGED
  }
  if (error.code === "RESERVATION_NOT_FOUND") {
    return OfflineConflictCode.RESERVATION_CHANGED
  }
  if (error.code === "IDEMPOTENCY_MISMATCH") {
    return OfflineConflictCode.IDEMPOTENCY_MISMATCH
  }
  if (error.code === "INVALID_SERVICE_TRANSITION") {
    return OfflineConflictCode.SERVICE_TRANSITION_CHANGED
  }
  if (error.code === "INVALID_ASSIGNEE") {
    return OfflineConflictCode.SERVICE_ASSIGNMENT_CHANGED
  }
  if (error.code === "SERVICE_EVIDENCE_UNAVAILABLE") {
    return OfflineConflictCode.SERVICE_EVIDENCE_CHANGED
  }
  return OfflineConflictCode.INVALID_COMMAND
}

function hasCapability(
  _payload: OfflineCommandPayload,
  capabilities: ReplayOfflineCommandsInput["capabilities"],
) {
  return capabilities.operateOrders
}

async function authoritativeState(
  db: PrismaClient,
  input: {
    payload: OfflineCommandPayload
    storeId: string
    tenantId: string
  },
) {
  const offerings = await db.sellableOffering.findMany({
    include: {
      productUnitOffering: {
        include: { inventoryUnit: true },
      },
      storeAvailability: { where: { storeId: input.storeId } },
    },
    where: {
      id: { in: input.payload.lines.map((line) => line.offeringId) },
      tenantId: input.tenantId,
    },
  })
  return {
    offerings: offerings.map((offering) => ({
      configurationVersionId:
        offering.productUnitOffering?.inventoryUnit.configurationVersionId ??
        null,
      fixedPriceMinor: offering.fixedPriceMinor,
      id: offering.id,
      isAvailable: offering.storeAvailability[0]?.isAvailable ?? false,
      status: offering.status,
    })),
  }
}

async function executeCommand(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientCommandId: string
    payload: OfflineCommandPayload
    storeId: string
    tenantId: string
  },
) {
  const common = {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
  }
  const payload = input.payload
  return createCommercialOrder(db, {
    ...common,
    ...payload,
    clientOrderId: input.clientCommandId,
    schemaVersion: 1,
    storeId: input.storeId,
  })
}

function serializeCommand(command: {
  authoritativeState: Prisma.JsonValue | null
  clientCommandId: string
  conflictCode: OfflineConflictCode | null
  conflictMessage: string | null
  createdAtClient: Date
  dependencyClientIds: Prisma.JsonValue
  id: string
  payload: Prisma.JsonValue
  processedAt: Date | null
  result: Prisma.JsonValue | null
  status: OfflineCommandStatus
  type: OfflineCommandType
}) {
  return {
    authoritativeState: command.authoritativeState,
    clientCommandId: command.clientCommandId,
    conflictCode: command.conflictCode,
    conflictMessage: command.conflictMessage,
    createdAtClient: command.createdAtClient,
    dependencyClientIds: command.dependencyClientIds,
    id: command.id,
    payload: command.payload,
    processedAt: command.processedAt,
    result: command.result,
    status: command.status,
    type: command.type,
  }
}

export async function replayOfflineCommands(
  db: PrismaClient,
  input: ReplayOfflineCommandsInput,
) {
  const device = await db.offlineDevice.findFirst({
    where: {
      deviceId: input.deviceId,
      status: OfflineDeviceStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!device) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "The offline device is not active for this Store.",
    )
  }

  const results: Array<ReturnType<typeof serializeCommand>> = []
  for (const envelope of input.commands) {
    const payloadHash = hash(envelope)
    let command = await db.offlineCommand.findUnique({
      where: {
        tenantId_clientCommandId: {
          clientCommandId: envelope.clientCommandId,
          tenantId: input.tenantId,
        },
      },
    })
    if (command && command.payloadHash !== payloadHash) {
      command = await db.offlineCommand.update({
        data: {
          attemptedState: json(envelope),
          conflictCode: OfflineConflictCode.IDEMPOTENCY_MISMATCH,
          conflictMessage:
            "This offline command identity was already used with different input.",
          processedAt: new Date(),
          status: OfflineCommandStatus.REVIEW_REQUIRED,
        },
        where: { id: command.id },
      })
      results.push(serializeCommand(command))
      continue
    }
    if (!command) {
      command = await db.offlineCommand.create({
        data: {
          clientCommandId: envelope.clientCommandId,
          createdAtClient: envelope.createdAtClient,
          dependencyClientIds: json(envelope.dependencyClientIds),
          eventVersion: envelope.eventVersion,
          offlineDeviceId: device.id,
          payload: json(envelope.payload),
          payloadHash,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: commandType(envelope.payload),
        },
      })
    }
    if (
      command.status === OfflineCommandStatus.APPLIED ||
      command.status === OfflineCommandStatus.DISCARDED
    ) {
      results.push(serializeCommand(command))
      continue
    }
    if (envelope.eventVersion !== 1) {
      command = await db.offlineCommand.update({
        data: {
          conflictCode: OfflineConflictCode.UNSUPPORTED_CLIENT,
          conflictMessage: `Offline event version ${envelope.eventVersion} is unsupported.`,
          processedAt: new Date(),
          status: OfflineCommandStatus.REVIEW_REQUIRED,
        },
        where: { id: command.id },
      })
      results.push(serializeCommand(command))
      continue
    }
    const dependencies = await db.offlineCommand.findMany({
      where: {
        clientCommandId: { in: envelope.dependencyClientIds },
        tenantId: input.tenantId,
      },
    })
    if (
      dependencies.length !== envelope.dependencyClientIds.length ||
      dependencies.some(
        (dependency) => dependency.status !== OfflineCommandStatus.APPLIED,
      )
    ) {
      command = await db.offlineCommand.update({
        data: {
          authoritativeState: json({
            dependencies: dependencies.map((dependency) => ({
              clientCommandId: dependency.clientCommandId,
              status: dependency.status,
            })),
          }),
          conflictCode: OfflineConflictCode.DEPENDENCY_BLOCKED,
          conflictMessage:
            "One or more required offline commands have not been accepted.",
          processedAt: new Date(),
          status: OfflineCommandStatus.BLOCKED,
        },
        where: { id: command.id },
      })
      results.push(serializeCommand(command))
      continue
    }
    if (!hasCapability(envelope.payload, input.capabilities)) {
      command = await db.offlineCommand.update({
        data: {
          conflictCode: OfflineConflictCode.PERMISSION_CHANGED,
          conflictMessage:
            "Your current permissions no longer allow this offline action.",
          processedAt: new Date(),
          status: OfflineCommandStatus.REVIEW_REQUIRED,
        },
        where: { id: command.id },
      })
      results.push(serializeCommand(command))
      continue
    }

    try {
      const result = await executeCommand(db, {
        actorUserId: input.actorUserId,
        clientCommandId: envelope.clientCommandId,
        payload: envelope.payload,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      command = await db.offlineCommand.update({
        data: {
          authoritativeState: Prisma.JsonNull,
          conflictCode: null,
          conflictMessage: null,
          processedAt: new Date(),
          result: json(result),
          status: OfflineCommandStatus.APPLIED,
        },
        where: { id: command.id },
      })
    } catch (error) {
      if (!(error instanceof CatalogError)) throw error
      const state = await authoritativeState(db, {
        payload: envelope.payload,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      command = await db.offlineCommand.update({
        data: {
          attemptedState: json(envelope.payload),
          authoritativeState: json(state),
          conflictCode: conflictCode(error),
          conflictMessage: error.message,
          processedAt: new Date(),
          status: OfflineCommandStatus.REVIEW_REQUIRED,
        },
        where: { id: command.id },
      })
    }
    results.push(serializeCommand(command))
  }
  return results
}

export async function listOfflineConflictReviews(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const commands = await db.offlineCommand.findMany({
    orderBy: { createdAtClient: "asc" },
    where: {
      status: {
        in: [
          OfflineCommandStatus.BLOCKED,
          OfflineCommandStatus.REVIEW_REQUIRED,
        ],
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const all = await db.offlineCommand.findMany({
    select: { clientCommandId: true, dependencyClientIds: true, status: true },
    where: { tenantId: input.tenantId },
  })
  return commands.map((command) => ({
    ...serializeCommand(command),
    dependentCommands: all
      .filter((candidate) =>
        Array.isArray(candidate.dependencyClientIds)
          ? candidate.dependencyClientIds.includes(command.clientCommandId)
          : false,
      )
      .map((candidate) => ({
        clientCommandId: candidate.clientCommandId,
        status: candidate.status,
      })),
    safeActions: ["retry", "discard"] as const,
  }))
}

export async function reviewOfflineConflict(
  db: PrismaClient,
  input: {
    actorUserId: string
    commandId: string
    decision: "discard" | "retry"
    reason?: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const command = await tx.offlineCommand.findFirst({
      where: {
        id: input.commandId,
        status: {
          in: [
            OfflineCommandStatus.BLOCKED,
            OfflineCommandStatus.REVIEW_REQUIRED,
          ],
        },
        tenantId: input.tenantId,
      },
    })
    if (!command) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Offline conflict review item not found.",
      )
    }
    const candidates = await tx.offlineCommand.findMany({
      select: { clientCommandId: true, dependencyClientIds: true },
      where: { tenantId: input.tenantId },
    })
    const dependentClientIds = candidates
      .filter((candidate) =>
        Array.isArray(candidate.dependencyClientIds)
          ? candidate.dependencyClientIds.includes(command.clientCommandId)
          : false,
      )
      .map((candidate) => candidate.clientCommandId)
    await tx.offlineConflictReview.create({
      data: {
        commandId: command.id,
        decision:
          input.decision === "retry"
            ? OfflineReviewDecision.RETRY
            : OfflineReviewDecision.DISCARD,
        dependentClientIds: json(dependentClientIds),
        reason: input.reason?.trim() || null,
        reviewedByUserId: input.actorUserId,
      },
    })
    const updated = await tx.offlineCommand.update({
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: input.actorUserId,
        status:
          input.decision === "retry"
            ? OfflineCommandStatus.PENDING
            : OfflineCommandStatus.DISCARDED,
      },
      where: { id: command.id },
    })
    return {
      ...serializeCommand(updated),
      dependentClientIds,
    }
  })
}
