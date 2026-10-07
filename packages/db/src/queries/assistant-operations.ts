import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

/**
 * Operations for the AI Setup Assistant (Phase 6): abandoned runs, attachment
 * retention and usage reporting. Nothing here reads message text, transcripts
 * or extracted content; reports carry counts and identifiers only.
 */

/** A turn has a 45 s foreground deadline; anything this old lost its process. */
export const ASSISTANT_RUN_ABANDONED_AFTER_MS = 15 * 60 * 1000
/** Upload intents that never received bytes are dropped after a day. */
export const ASSISTANT_UNFINISHED_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000
export const ASSISTANT_RUN_ABANDONED = "RUN_ABANDONED"
export const ASSISTANT_ATTACHMENT_RETENTION_EXPIRED = "RETENTION_EXPIRED"

/**
 * Runs left RUNNING by a crashed or redeployed process. The stream guard is
 * process-local, so no live turn can still own a run this old.
 */
export async function failAbandonedAssistantRuns(
  db: DbClient,
  input: { now: Date; olderThanMs?: number },
) {
  const cutoff = new Date(
    input.now.getTime() -
      (input.olderThanMs ?? ASSISTANT_RUN_ABANDONED_AFTER_MS),
  )
  const result = await db.assistantRun.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      errorCode: ASSISTANT_RUN_ABANDONED,
      completedAt: input.now,
    },
  })
  return { failed: result.count }
}

const expiredSelect = {
  id: true,
  tenantId: true,
  conversationId: true,
  messageId: true,
  contentDigest: true,
  contentType: true,
  sizeBytes: true,
  fileName: true,
  storagePath: true,
} as const

/**
 * Attachments whose stored bytes must go: past their retention date (still
 * holding bytes or content), or upload intents that never completed.
 */
export async function listExpiredAssistantAttachments(
  db: DbClient,
  input: { now: Date; limit: number },
) {
  const unfinishedBefore = new Date(
    input.now.getTime() - ASSISTANT_UNFINISHED_UPLOAD_GRACE_MS,
  )
  const rows = await db.assistantAttachment.findMany({
    where: {
      OR: [
        // Not yet expired by this job (a NULL code is "not expired" too).
        {
          retentionUntil: { lt: input.now },
          OR: [
            { errorCode: null },
            { errorCode: { not: ASSISTANT_ATTACHMENT_RETENTION_EXPIRED } },
          ],
        },
        { status: "PENDING_UPLOAD", uploadExpiresAt: { lt: unfinishedBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: input.limit,
    select: expiredSelect,
  })
  const tenants = await db.tenant.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.tenantId))] } },
    select: { id: true, dataClassification: true },
  })
  const classification = new Map(
    tenants.map((tenant) => [tenant.id, tenant.dataClassification]),
  )
  return rows.map((row) => ({
    ...row,
    dataClassification: classification.get(row.tenantId) ?? "LIVE",
  }))
}

/**
 * After the bytes are deleted: unsent files disappear; sent files keep only
 * their name and kind (the chat history and setup-list provenance refer to
 * them) and lose their stored location, transcript and extracted content.
 */
export async function expireAssistantAttachment(
  db: DbClient,
  attachment: { id: string; messageId: string | null },
) {
  if (!attachment.messageId) {
    await db.assistantAttachment.deleteMany({ where: { id: attachment.id } })
    return "deleted" as const
  }
  await db.assistantAttachment.updateMany({
    where: { id: attachment.id },
    data: {
      storagePath: null,
      storageProvider: null,
      storageStoreId: null,
      transcript: null,
      extraction: Prisma.DbNull,
      errorCode: ASSISTANT_ATTACHMENT_RETENTION_EXPIRED,
    },
  })
  return "cleared" as const
}

/** Usage since a date, grouped for cost review; no content, no user data. */
export async function summarizeAssistantUsage(
  db: DbClient,
  input: { since: Date },
) {
  const [usage, runs, running] = await Promise.all([
    db.assistantUsageEvent.groupBy({
      by: ["tenantId", "provider", "model", "requestClass", "outcome"],
      where: { createdAt: { gte: input.since } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        audioSeconds: true,
        imageCount: true,
      },
    }),
    db.assistantRun.groupBy({
      by: ["status", "errorCode"],
      where: { startedAt: { gte: input.since } },
      _count: { _all: true },
    }),
    db.assistantRun.count({ where: { status: "RUNNING" } }),
  ])
  return {
    usage: usage.map((row) => ({
      tenantId: row.tenantId,
      provider: row.provider,
      model: row.model,
      requestClass: row.requestClass,
      outcome: row.outcome,
      calls: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      cachedInputTokens: row._sum.cachedInputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      audioSeconds: row._sum.audioSeconds ?? 0,
      imageCount: row._sum.imageCount ?? 0,
    })),
    runs: runs.map((row) => ({
      status: row.status,
      errorCode: row.errorCode,
      count: row._count._all,
    })),
    runningNow: running,
  }
}
