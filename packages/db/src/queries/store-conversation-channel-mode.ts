import { createHash } from "node:crypto"

import {
  type StoreConversationDesiredMode,
  storeConversationChannelModeUpdateInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationDesiredMode as DatabaseDesiredMode,
  MembershipRole,
  MembershipStatus,
  StoreConversationChannelConfigurationAuditEventType,
} from "../../generated/prisma/enums"
import type { DbClient } from "./types"

export type StoreConversationChannelModeErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"

export class StoreConversationChannelModeError extends Error {
  constructor(
    readonly code: StoreConversationChannelModeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationChannelModeError"
  }
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

function payloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function projectStoredStoreConversationDesiredMode(
  value: DatabaseDesiredMode,
): StoreConversationDesiredMode {
  if (value === DatabaseDesiredMode.WHATSAPP) return "whatsapp"
  if (value === DatabaseDesiredMode.BOTH) return "both"
  return "ewatrade_chat"
}

function databaseDesiredMode(value: StoreConversationDesiredMode) {
  if (value === "whatsapp") return DatabaseDesiredMode.WHATSAPP
  if (value === "both") return DatabaseDesiredMode.BOTH
  return DatabaseDesiredMode.EWATRADE_CHAT
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
      select: { id: true },
      where: {
        id: input.storeId,
        status: "ACTIVE",
        tenantId: input.tenantId,
      },
    }),
  ])
  if (!membership) {
    throw new StoreConversationChannelModeError(
      "FORBIDDEN",
      "Owner or administrator access is required.",
    )
  }
  if (!store) {
    throw new StoreConversationChannelModeError("NOT_FOUND", "Store not found.")
  }
}

export function getStoreConversationChannelModeCompatibilityConfiguration() {
  return { desiredMode: "ewatrade_chat" as const, revision: 0 }
}

export async function loadStoreConversationChannelModeConfiguration(
  db: DbClient,
  input: { storeId: string; tenantId: string },
) {
  const configuration =
    await db.storeConversationChannelConfiguration.findUnique({
      select: { desiredMode: true, revision: true, tenantId: true },
      where: { storeId: input.storeId },
    })
  if (!configuration) {
    return getStoreConversationChannelModeCompatibilityConfiguration()
  }
  if (configuration.tenantId !== input.tenantId) {
    throw new StoreConversationChannelModeError("NOT_FOUND", "Store not found.")
  }
  return {
    desiredMode: projectStoredStoreConversationDesiredMode(
      configuration.desiredMode,
    ),
    revision: configuration.revision,
  }
}

export async function getStoreConversationChannelModeConfiguration(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  await requireStoreManager(db, input)
  return loadStoreConversationChannelModeConfiguration(db, input)
}

function translateWriteError(error: unknown): never {
  if (error instanceof StoreConversationChannelModeError) throw error
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  ) {
    throw new StoreConversationChannelModeError(
      "CONFLICT",
      "Conversation mode changed. Refresh and try again.",
    )
  }
  throw error
}

export async function updateStoreConversationChannelMode(
  db: PrismaClient,
  rawInput: {
    actorUserId: string
    clientOperationId: string
    desiredMode: StoreConversationDesiredMode
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const input = storeConversationChannelModeUpdateInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    desiredMode: rawInput.desiredMode,
    expectedRevision: rawInput.expectedRevision,
    reason: rawInput.reason,
    storeId: rawInput.storeId,
  })
  const commandPayloadHash = payloadHash({
    ...input,
    actorUserId: rawInput.actorUserId,
    tenantId: rawInput.tenantId,
  })

  try {
    return await db.$transaction(async (tx) => {
      await requireStoreManager(tx, rawInput)
      const existing =
        await tx.storeConversationChannelConfiguration.findUnique({
          where: { storeId: input.storeId },
        })
      if (existing) {
        const replay =
          await tx.storeConversationChannelConfigurationCommand.findUnique({
            where: {
              configurationId_clientOperationId: {
                clientOperationId: input.clientOperationId,
                configurationId: existing.id,
              },
            },
          })
        if (replay) {
          if (replay.payloadHash !== commandPayloadHash) {
            throw new StoreConversationChannelModeError(
              "CONFLICT",
              "This conversation-mode command was already used with different details.",
            )
          }
          return {
            desiredMode: projectStoredStoreConversationDesiredMode(
              replay.desiredMode,
            ),
            replayed: true,
            revision: replay.revision,
          }
        }
      }
      if ((existing?.revision ?? 0) !== input.expectedRevision) {
        throw new StoreConversationChannelModeError(
          "CONFLICT",
          "Conversation mode changed. Refresh and try again.",
        )
      }

      const nextMode = databaseDesiredMode(input.desiredMode)
      let configuration = existing
      if (existing) {
        const updated =
          await tx.storeConversationChannelConfiguration.updateMany({
            data: {
              desiredMode: nextMode,
              reason: input.reason,
              revision: { increment: 1 },
              updatedByUserId: rawInput.actorUserId,
            },
            where: {
              id: existing.id,
              revision: input.expectedRevision,
              storeId: input.storeId,
              tenantId: rawInput.tenantId,
            },
          })
        if (updated.count !== 1) {
          throw new StoreConversationChannelModeError(
            "CONFLICT",
            "Conversation mode changed. Refresh and try again.",
          )
        }
        configuration = {
          ...existing,
          desiredMode: nextMode,
          reason: input.reason,
          revision: input.expectedRevision + 1,
          updatedByUserId: rawInput.actorUserId,
        }
      } else {
        configuration = await tx.storeConversationChannelConfiguration.create({
          data: {
            desiredMode: nextMode,
            reason: input.reason,
            storeId: input.storeId,
            tenantId: rawInput.tenantId,
            updatedByUserId: rawInput.actorUserId,
          },
        })
      }

      await tx.storeConversationChannelConfigurationCommand.create({
        data: {
          clientOperationId: input.clientOperationId,
          configurationId: configuration.id,
          desiredMode: nextMode,
          payloadHash: commandPayloadHash,
          revision: configuration.revision,
          storeId: input.storeId,
          tenantId: rawInput.tenantId,
        },
      })
      await tx.storeConversationChannelConfigurationAuditEvent.create({
        data: {
          actorUserId: rawInput.actorUserId,
          configurationId: configuration.id,
          fromMode: existing?.desiredMode ?? null,
          reason: input.reason,
          revision: configuration.revision,
          storeId: input.storeId,
          tenantId: rawInput.tenantId,
          toMode: nextMode,
          type: StoreConversationChannelConfigurationAuditEventType.UPDATED,
        },
      })

      return {
        desiredMode: input.desiredMode,
        replayed: false,
        revision: configuration.revision,
      }
    }, transactionOptions)
  } catch (error) {
    translateWriteError(error)
  }
}
