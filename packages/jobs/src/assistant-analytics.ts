import type { VoiceAttempt } from "@ewatrade/ai/transcription-contracts"
import { prisma } from "@ewatrade/db/client"
import { assistantSignalSchema } from "@ewatrade/events/assistant-signals"
import { recordDashboardOutcome } from "./product-analytics"

/** Origin is an API-approved collection grant, never inferred by a background job. */
export function assistantVoiceObserver(
  attachment: {
    id: string
    actorUserId: string
    tenantId: string
    processingAttempts: number
  },
  origin?: string,
) {
  return async (attempt: VoiceAttempt) => {
    if (!origin || process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED !== "true")
      return
    try {
      const [user, tenant, membership] = await Promise.all([
        prisma.user.findUnique({
          where: { id: attachment.actorUserId },
          select: { id: true, email: true, isPlatformAdmin: true },
        }),
        prisma.tenant.findUnique({
          where: { id: attachment.tenantId },
          select: {
            id: true,
            name: true,
            dataClassification: true,
            qaPurgeStartedAt: true,
          },
        }),
        prisma.membership.findFirst({
          where: {
            userId: attachment.actorUserId,
            tenantId: attachment.tenantId,
            status: "ACTIVE",
          },
          select: { role: true },
        }),
      ])
      if (!user || !tenant || !membership || tenant.qaPurgeStartedAt) return
      const signal = assistantSignalSchema.safeParse({
        action: `transcription_${attempt.provider}`,
        phase: attempt.outcome === "success" ? "completed" : attempt.outcome,
        provider: attempt.provider,
        model: /^[a-zA-Z0-9_./:-]{1,100}$/.test(attempt.model)
          ? attempt.model
          : "unknown",
        environment: process.env.APP_ENV,
        error_code: attempt.errorCode,
        duration_ms: attempt.durationMs,
        attempt_ordinal: attempt.ordinal,
      })
      if (!signal.success) return
      await recordDashboardOutcome({
        headers: new Headers({ origin, "x-ewatrade-analytics": "allowed" }),
        principal: {
          userId: user.id,
          email: user.email,
          internal: user.isPlatformAdmin,
          tenantId: tenant.id,
          tenantName: tenant.name,
          dataClassification: tenant.dataClassification,
          role: membership.role,
        },
        path: "assistant.transcription",
        output: null,
        requestId: attachment.id,
        commandId: `${attachment.id}:${attachment.processingAttempts}:${attempt.ordinal}`,
        signal: signal.data,
      })
    } catch {
      /* Optional analytics cannot break provider fallback. */
    }
  }
}
