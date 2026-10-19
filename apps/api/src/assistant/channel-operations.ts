import { z } from "zod"

const count = z
  .union([z.number(), z.bigint(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe())
const duration = z.number().finite().nonnegative().nullable()
const rawSnapshot = z.object({
  pendingInbox: count,
  processingInbox: count,
  failedInbox: count,
  authorityDeniedInbox: count,
  ingressQuotaNotices: count,
  modelBudgetDeniedRuns: count,
  deliveryQuotaHeldOutbox: count,
  oldestInboxAgeMs: duration,
  pendingOutbox: count,
  sendingOutbox: count,
  unknownOutbox: count,
  failedOutbox: count,
  oldestOutboxAgeMs: duration,
  outsideServiceWindow: count,
  unknownAttempts: count,
  acceptedAttempts: count,
  channelRuns: count,
  failedRuns: count,
  runningRuns: count,
  averageRunMs: duration,
  inputTokens: count,
  cachedInputTokens: count,
  outputTokens: count,
  voiceAttempts: count,
  voiceEstimateCount: count,
  voiceEstimatedMicros: z.string().max(80).regex(/^\d+$/).nullable(),
  expiredInboxContent: count,
  expiredOutboxContent: count,
  expiredLiveGrants: count,
  expiredPrivateMedia: count,
})
type AggregateDatabase = {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>
}
const unavailable = () => ({
  version: "whatsapp-operations-v1" as const,
  status: "unavailable" as const,
  code: "DIAGNOSTICS_UNAVAILABLE" as const,
})

/** Whitelist only. Neither extra SQL fields nor raw errors can become operational output. */
export function assistantWhatsAppOperationsSnapshot(
  input: unknown,
  window: { since: Date; now: Date },
) {
  const parsed = rawSnapshot.safeParse(input)
  if (
    !parsed.success ||
    !Number.isFinite(window.since.getTime()) ||
    !Number.isFinite(window.now.getTime()) ||
    window.since >= window.now ||
    window.now.getTime() - window.since.getTime() > 31 * 24 * 60 * 60_000
  )
    return unavailable()
  const row = parsed.data
  if (
    row.voiceEstimateCount > row.voiceAttempts ||
    (row.voiceEstimateCount > 0 && row.voiceEstimatedMicros === null)
  )
    return unavailable()
  return {
    version: "whatsapp-operations-v1" as const,
    status: "logical_snapshot" as const,
    since: window.since.toISOString(),
    checkedAt: window.now.toISOString(),
    attentionRequired:
      row.unknownOutbox > 0 ||
      row.unknownAttempts > 0 ||
      row.failedInbox > 0 ||
      row.failedOutbox > 0 ||
      row.failedRuns > 0 ||
      row.outsideServiceWindow > 0 ||
      row.expiredInboxContent > 0 ||
      row.expiredOutboxContent > 0 ||
      row.expiredLiveGrants > 0 ||
      row.expiredPrivateMedia > 0 ||
      (row.oldestInboxAgeMs ?? 0) > 300_000 ||
      (row.oldestOutboxAgeMs ?? 0) > 300_000,
    inbox: {
      pending: row.pendingInbox,
      processing: row.processingInbox,
      failedInWindow: row.failedInbox,
      authorityDeniedInWindow: row.authorityDeniedInbox,
      oldestQueuedAgeMs: row.oldestInboxAgeMs,
    },
    delivery: {
      pending: row.pendingOutbox,
      sending: row.sendingOutbox,
      unknown: row.unknownOutbox,
      failedInWindow: row.failedOutbox,
      oldestQueuedAgeMs: row.oldestOutboxAgeMs,
      outsideServiceWindow: row.outsideServiceWindow,
      unknownAttempts: row.unknownAttempts,
      acceptedAttemptsInWindow: row.acceptedAttempts,
      unknownRecovery: "receipt_reconciliation_only_no_resend" as const,
    },
    runs: {
      startedInWindow: row.channelRuns,
      failedInWindow: row.failedRuns,
      stillRunningFromWindow: row.runningRuns,
      averageCompletedDurationMs: row.averageRunMs,
    },
    limits: {
      modelBudgetDeniedRunsInWindow: row.modelBudgetDeniedRuns,
      deliveryQuotaHeldReplies: row.deliveryQuotaHeldOutbox,
      ingressDeniedAdmissions: {
        status: "notice_count_only" as const,
        noticeCountInWindow: row.ingressQuotaNotices,
      },
    },
    retention: {
      expiredInboxContent: row.expiredInboxContent,
      expiredOutboxContent: row.expiredOutboxContent,
      expiredLiveGrants: row.expiredLiveGrants,
      expiredPrivateMedia: row.expiredPrivateMedia,
    },
    cost: {
      transport: {
        status: "unknown" as const,
        billedAmountMicros: null,
        currency: null,
        reason: "provider_amount_not_recorded" as const,
      },
      model: {
        status: "unknown" as const,
        billedAmountMicros: null,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens,
      },
      voice: {
        status: "recorded_estimates_only" as const,
        attemptsInWindow: row.voiceAttempts,
        attemptsWithEstimate: row.voiceEstimateCount,
        attemptsWithoutEstimate: row.voiceAttempts - row.voiceEstimateCount,
        estimatedCostMicros: row.voiceEstimateCount
          ? row.voiceEstimatedMicros
          : null,
        billedAmountMicros: null,
      },
    },
    providerAvailability: "not_probed" as const,
  }
}

/** Internal operator helper, not a merchant route. Aggregate read only; never selects private values. */
export async function readAssistantWhatsAppOperations(
  db: AggregateDatabase,
  input: { since: Date; now?: Date },
) {
  const now = input.now ?? new Date()
  if (
    !Number.isFinite(input.since.getTime()) ||
    !Number.isFinite(now.getTime()) ||
    input.since >= now ||
    now.getTime() - input.since.getTime() > 31 * 24 * 60 * 60_000
  )
    return unavailable()
  try {
    const rows = await db.$queryRaw`
      WITH channel_runs AS (
        SELECT r.id, r.status, r."errorCode", r."startedAt", r."completedAt" FROM "AssistantRun" r
        WHERE r."startedAt">=${input.since} AND r."startedAt"<=${now} AND EXISTS (
          SELECT 1 FROM "AssistantWhatsAppInbox" q JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId"
          JOIN "AssistantWhatsAppIdentity" i ON i.id=b."identityId"
          WHERE q."requestId"=r."requestId" AND b."conversationId"=r."conversationId" AND i."userId"=r."actorUserId"
        )
      ), usage AS (
        SELECT COALESCE(sum(u."inputTokens"),0)::text AS input, COALESCE(sum(u."cachedInputTokens"),0)::text AS cached,
          COALESCE(sum(u."outputTokens"),0)::text AS output
        FROM "AssistantUsageEvent" u JOIN channel_runs r ON r.id=u."runId"
      ), voice AS (
        SELECT count(*)::text AS attempts, count(t."estimatedCostMicros")::text AS estimates,
          sum(t."estimatedCostMicros")::text AS micros
        FROM "AssistantTranscriptionAttempt" t JOIN "AssistantAttachment" a ON a.id=t."attachmentId"
        WHERE t."startedAt">=${input.since} AND t."startedAt"<=${now} AND a."clientRequestId" LIKE 'whatsapp-media:%'
      ) SELECT
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE state='PENDING') AS "pendingInbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE state='PROCESSING') AS "processingInbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE state='FAILED' AND "receivedAt">=${input.since} AND "receivedAt"<=${now}) AS "failedInbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE "errorCode" IN ('AUTHORITY_CHANGED','GRANT_REVOKED','GRANT_EXPIRED','CHANNEL_DISCONNECTED') AND "receivedAt">=${input.since} AND "receivedAt"<=${now}) AS "authorityDeniedInbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE id LIKE 'wa-quota-%' AND "requestId"=id||'-notice' AND kind='TURN' AND "receivedAt">=${input.since} AND "receivedAt"<=${now}) AS "ingressQuotaNotices",
        (SELECT count(*)::text FROM channel_runs WHERE "errorCode"='BUDGET_EXHAUSTED') AS "modelBudgetDeniedRuns",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE state='PENDING' AND "errorCode"='DELIVERY_RATE_LIMITED') AS "deliveryQuotaHeldOutbox",
        (SELECT CASE WHEN count(*)>0 THEN GREATEST(0,EXTRACT(EPOCH FROM (${now}-min("receivedAt")))*1000)::float8 ELSE NULL END FROM "AssistantWhatsAppInbox" WHERE state IN ('PENDING','PROCESSING')) AS "oldestInboxAgeMs",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE state='PENDING') AS "pendingOutbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE state='SENDING') AS "sendingOutbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE state='UNKNOWN') AS "unknownOutbox",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE state='FAILED' AND "createdAt">=${input.since} AND "createdAt"<=${now}) AS "failedOutbox",
        (SELECT CASE WHEN count(*)>0 THEN GREATEST(0,EXTRACT(EPOCH FROM (${now}-min("createdAt")))*1000)::float8 ELSE NULL END FROM "AssistantWhatsAppOutbox" WHERE state IN ('PENDING','SENDING')) AS "oldestOutboxAgeMs",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" o JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId" WHERE o.state IN ('PENDING','SENDING') AND LEAST(q."providerOccurredAt"+interval '24 hours',o."expiresAt")<=${now}) AS "outsideServiceWindow",
        (SELECT count(*)::text FROM "AssistantWhatsAppAttempt" WHERE state='UNKNOWN') AS "unknownAttempts",
        (SELECT count(*)::text FROM "AssistantWhatsAppAttempt" WHERE state='ACCEPTED' AND "startedAt">=${input.since} AND "startedAt"<=${now}) AS "acceptedAttempts",
        (SELECT count(*)::text FROM channel_runs) AS "channelRuns",
        (SELECT count(*)::text FROM channel_runs WHERE status='FAILED') AS "failedRuns",
        (SELECT count(*)::text FROM channel_runs WHERE status='RUNNING') AS "runningRuns",
        (SELECT avg(GREATEST(0,EXTRACT(EPOCH FROM ("completedAt"-"startedAt")))*1000)::float8 FROM channel_runs WHERE "completedAt" IS NOT NULL) AS "averageRunMs",
        usage.input AS "inputTokens", usage.cached AS "cachedInputTokens", usage.output AS "outputTokens",
        voice.attempts AS "voiceAttempts", voice.estimates AS "voiceEstimateCount", voice.micros AS "voiceEstimatedMicros",
        (SELECT count(*)::text FROM "AssistantWhatsAppInbox" WHERE "expiresAt"<=${now} AND content IS NOT NULL AND content<>'null'::jsonb) AS "expiredInboxContent",
        (SELECT count(*)::text FROM "AssistantWhatsAppOutbox" WHERE "expiresAt"<=${now} AND content IS NOT NULL) AS "expiredOutboxContent",
        (SELECT count(*)::text FROM "AssistantWhatsAppGrant" WHERE "revokedAt" IS NULL AND LEAST("expiresAt","idleExpiresAt")<=${now}) AS "expiredLiveGrants",
        (SELECT count(*)::text FROM "AssistantAttachment" WHERE "clientRequestId" LIKE 'whatsapp-media:%' AND "retentionUntil"<=${now} AND "storagePath" IS NOT NULL) AS "expiredPrivateMedia"
      FROM usage CROSS JOIN voice
    `
    return assistantWhatsAppOperationsSnapshot(
      Array.isArray(rows) && rows.length === 1 ? rows[0] : null,
      { since: input.since, now },
    )
  } catch {
    return unavailable()
  }
}
