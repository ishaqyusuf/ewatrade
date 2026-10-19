import { assistantAttachmentKindAllowedForPurpose } from "@ewatrade/assistant/setup/attachments"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type AssistantScope,
  assistantBudgetScopeKey,
  reserveAssistantMediaBudgetInTransaction,
} from "./assistant"
import { assertAssistantWhatsAppMediaProcessingSourceActive } from "./assistant-whatsapp/media-source-lifecycle"
import {
  runInOwnSerializableTransaction,
  runInOwnTransaction,
} from "./own-transaction"
import { getActiveTenantForUser } from "./tenants"
import type { DbClient } from "./types"

const gatewayKey = "assistant.voice.gateway.v1"

/** Compare and swap prevents an old publisher renewing/deleting a new tunnel. */
export async function publishVoiceGateway(
  db: PrismaClient,
  input: {
    url: string
    generation: string
    previousGeneration: string | null
    environment: string
    remove?: boolean
  },
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const row = await tx.systemConfiguration.findUnique({
      where: { key: gatewayKey },
    })
    const current = row?.value as
      | { generation?: string; expiresAt?: number }
      | undefined
    if (
      current?.generation !== input.generation &&
      current?.generation !== input.previousGeneration &&
      (current?.expiresAt ?? 0) > Date.now()
    )
      return false
    if (input.remove) {
      if (current?.generation !== input.generation) return false
      await tx.systemConfiguration.deleteMany({ where: { key: gatewayKey } })
    } else {
      const value = {
        url: input.url,
        generation: input.generation,
        environment: input.environment,
        expiresAt: Date.now() + 180_000,
      }
      await tx.systemConfiguration.upsert({
        where: { key: gatewayKey },
        create: { key: gatewayKey, value },
        update: { value, revision: { increment: 1 } },
      })
    }
    return true
  })
}

export function readVoiceGateway(db: DbClient) {
  return db.systemConfiguration.findUnique({
    where: { key: gatewayKey },
    select: { value: true },
  })
}

export async function assertAssistantAttachmentProcessingActive(
  db: DbClient,
  attachmentId: string,
  generation: number,
  options: { liveOnly?: boolean } = {},
) {
  const now = new Date()
  const row = await db.assistantAttachment.findFirst({
    where: {
      id: attachmentId,
      status: "PROCESSING",
      processingAttempts: generation,
      leaseUntil: { gt: now },
      retentionUntil: { gt: now },
      conversation: {
        status: "ACTIVE",
        owner: {
          accountPrivacyRequests: {
            none: { status: { in: ["PROCESSING", "COMPLETED"] } },
          },
        },
        tenant: {
          isActive: true,
          ...(options.liveOnly ? { dataClassification: "LIVE" as const } : {}),
          qaPurgeStartedAt: null,
        },
      },
    },
    select: {
      id: true,
      kind: true,
      conversationId: true,
      tenantId: true,
      storeId: true,
      actorUserId: true,
      clientRequestId: true,
      conversation: {
        select: {
          ownerUserId: true,
          tenantId: true,
          storeId: true,
          purpose: true,
          tenant: { select: { slug: true } },
        },
      },
    },
  })
  if (!row) throw new Error("VOICE_CANCELLED")
  if (
    row.conversation.ownerUserId !== row.actorUserId ||
    row.conversation.tenantId !== row.tenantId ||
    row.conversation.storeId !== row.storeId ||
    !["GENERAL", "SETUP", "PRODUCT_CREATE"].includes(
      row.conversation.purpose,
    ) ||
    !assistantAttachmentKindAllowedForPurpose(
      row.kind,
      row.conversation.purpose,
    )
  )
    throw new Error("VOICE_ACCESS_REVOKED")
  // Same canonical active membership and Store-assignment resolution as the app.
  const context = await getActiveTenantForUser(db, {
    userId: row.actorUserId,
    tenantSlug: row.conversation.tenant.slug,
    storeId: row.storeId,
  })
  const roles =
    row.conversation.purpose === "GENERAL"
      ? ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"]
      : ["OWNER", "ADMIN"]
  if (
    !context ||
    context.tenant.id !== row.tenantId ||
    (options.liveOnly && context.tenant.dataClassification !== "LIVE") ||
    context.tenant.qaPurgeStartedAt ||
    context.activeStore?.id !== row.storeId ||
    context.activeStore.status !== "ACTIVE" ||
    context.staffAccess?.status !== "ACTIVE" ||
    !roles.includes(context.staffAccess.businessRole) ||
    !roles.includes(context.membership.role)
  )
    throw new Error("VOICE_ACCESS_REVOKED")
  await assertAssistantWhatsAppMediaProcessingSourceActive(db, row, now)
}

export function assertVoiceAttemptActive(
  db: DbClient,
  attachmentId: string,
  generation: number,
) {
  return assertAssistantAttachmentProcessingActive(
    db,
    attachmentId,
    generation,
    { liveOnly: true },
  )
}

/** User allowance charged once for a recording, even across provider fallback/retry. */
export function reserveVoiceAudio(
  db: PrismaClient,
  attachmentId: string,
  audioSeconds: number,
  generation: number,
) {
  return runInOwnTransaction(db, async (tx) => {
    const now = new Date()
    const [row] = await tx.$queryRaw<
      Array<{ tenantId: string; audioBudgetReserved: boolean }>
    >(
      Prisma.sql`SELECT "tenantId", "audioBudgetReserved" FROM "AssistantAttachment" WHERE id = ${attachmentId} AND status = 'PROCESSING' AND "processingAttempts" = ${generation} AND "retentionUntil" > ${now} AND "leaseUntil" > ${now} FOR UPDATE`,
    )
    if (!row) return false
    if (row.audioBudgetReserved) return true
    const budget = await reserveAssistantMediaBudgetInTransaction(tx, {
      scopeKey: assistantBudgetScopeKey(row.tenantId, "SETUP"),
      audioSeconds,
      limits: {
        maxAudioSeconds: 1200,
        maxVisionImages: 40,
        windowMs: 30 * 86400_000,
      },
    })
    if (!budget.allowed) return false
    await tx.assistantAttachment.update({
      where: { id: attachmentId },
      data: { audioBudgetReserved: true },
    })
    return true
  })
}

export async function recordVoiceAttemptInTransaction(
  db: Prisma.TransactionClient,
  input: {
    attachmentId: string
    generation: number
    ordinal: number
    provider: string
    model: string
    outcome: string
    audioSeconds: number
    errorCode?: string
    durationMs?: number
    gatewayGeneration?: string
    providerRequestId?: string
    billingStatus: string
    estimatedCostMicros?: bigint
    pricingVersion?: string
  },
) {
  const { attachmentId, generation, ordinal, ...data } = input
  const attachment = await db.assistantAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, actorUserId: true, processingAttempts: true },
  })
  if (!attachment) {
    if (input.outcome === "started") throw new Error("VOICE_CANCELLED")
    return
  }
  // Provider admission remains fenced after a privacy feature switch is turned
  // off. This is the canonical request SHARE lock, without its write-flag bypass.
  const privacy = await db.$queryRaw<{ status: string }[]>(
    Prisma.sql`SELECT "status" FROM "AccountPrivacyRequest" WHERE "requestKey"=${`account-deletion:${attachment.actorUserId}`} FOR SHARE`,
  )
  const allowed = !privacy.some((row) =>
    ["PROCESSING", "COMPLETED"].includes(row.status),
  )
  const existing = await db.assistantTranscriptionAttempt.findUnique({
    where: {
      attachmentId_generation_ordinal: { attachmentId, generation, ordinal },
    },
    select: { provider: true },
  })
  if (existing && existing.provider !== input.provider)
    throw new Error("VOICE_ATTEMPT_CHANGED")
  if (
    input.outcome === "started" &&
    (!allowed || attachment.processingAttempts !== generation)
  )
    throw new Error("VOICE_CANCELLED")
  if (!allowed) {
    // Terminal provider outcomes may reconcile an admitted attempt, but cannot
    // create a new attempt after the account privacy fence or attachment erasure.
    if (existing)
      await db.assistantTranscriptionAttempt.updateMany({
        where: { attachmentId, generation, ordinal, provider: input.provider },
        data: { ...data, completedAt: new Date() },
      })
    return
  }
  await db.assistantTranscriptionAttempt.upsert({
    where: {
      attachmentId_generation_ordinal: { attachmentId, generation, ordinal },
    },
    create: {
      attachmentId,
      generation,
      ordinal,
      ...data,
      completedAt: input.outcome === "started" ? null : new Date(),
    },
    update: {
      ...data,
      completedAt: input.outcome === "started" ? null : new Date(),
    },
  })
}

export function recordVoiceAttempt(
  db: PrismaClient,
  input: Parameters<typeof recordVoiceAttemptInTransaction>[1],
) {
  return runInOwnTransaction(db, (tx) =>
    recordVoiceAttemptInTransaction(tx, input),
  )
}

export async function voiceCircuitOpen(
  db: DbClient,
  provider: string,
  model: string,
) {
  const rows = await db.assistantTranscriptionAttempt.findMany({
    where: {
      provider,
      model,
      startedAt: { gt: new Date(Date.now() - 60_000) },
      outcome: { in: ["failed", "success"] },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: { outcome: true, errorCode: true },
  })
  return (
    rows.length === 3 &&
    rows.every(
      (row) =>
        row.outcome === "failed" &&
        ["TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(row.errorCode ?? ""),
    )
  )
}

export async function readVoiceUsage(
  db: DbClient,
  scope: AssistantScope,
  days: number,
) {
  const groups = await db.assistantTranscriptionAttempt.groupBy({
    by: ["provider", "model", "outcome", "billingStatus"],
    where: {
      startedAt: { gte: new Date(Date.now() - days * 86400_000) },
      attachment: { tenantId: scope.tenantId, storeId: scope.storeId },
    },
    _count: { _all: true },
    _sum: { audioSeconds: true, estimatedCostMicros: true },
    _avg: { durationMs: true },
  })
  const requests = await db.assistantAttachment.aggregate({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      kind: "AUDIO",
      createdAt: { gte: new Date(Date.now() - days * 86400_000) },
    },
    _count: { _all: true },
    _sum: { durationMs: true },
  })
  return {
    days,
    currency: "USD",
    recordings: requests._count._all,
    recordedSeconds: Math.ceil((requests._sum.durationMs ?? 0) / 1000),
    groups: groups.map((row) => ({
      provider: row.provider,
      model: row.model,
      outcome: row.outcome,
      billingStatus: row.billingStatus,
      attempts: row._count._all,
      audioSeconds: row._sum.audioSeconds ?? 0,
      estimatedCostMicros: row._sum.estimatedCostMicros?.toString() ?? null,
      averageDurationMs: row._avg.durationMs,
    })),
  }
}
