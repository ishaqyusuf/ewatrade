import { assistantProviderApiKey } from "@ewatrade/ai/provider"
import { localWhisperEnrolled } from "@ewatrade/ai/transcription"
import { normalizeGatewayUrl } from "@ewatrade/ai/transcription-contracts"
import { readVoiceGateway } from "@ewatrade/db/assistant-voice"
import type { TRPCContext } from "../trpc/init"

type Environment = Readonly<Record<string, string | undefined>>

export type VoiceAvailability = {
  available: boolean
  provider: "local_whisper" | "openai" | "xai" | null
  reason: "off" | "no_provider" | null
}

/** The latest attempt says the key is wrong or out of credit. */
const BLOCKING_ERRORS = ["PROVIDER_AUTH", "RATE_LIMITED"]
/** Three straight outages within a minute, as the transcriber's own circuit. */
const OUTAGE_ERRORS = ["TIMEOUT", "PROVIDER_UNAVAILABLE"]

async function cloudUsable(db: TRPCContext["db"], provider: string) {
  const rows = await db.assistantTranscriptionAttempt.findMany({
    where: {
      provider,
      startedAt: { gt: new Date(Date.now() - 15 * 60_000) },
      outcome: { in: ["failed", "success"] },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: { outcome: true, errorCode: true, startedAt: true },
  })
  const latest = rows[0]
  if (
    latest?.outcome === "failed" &&
    BLOCKING_ERRORS.includes(latest.errorCode ?? "")
  )
    return false
  const outage =
    rows.length === 3 &&
    rows.every(
      (row) =>
        row.outcome === "failed" &&
        OUTAGE_ERRORS.includes(row.errorCode ?? "") &&
        row.startedAt.getTime() > Date.now() - 60_000,
    )
  return !outage
}

/**
 * Whether a voice note can be written out right now, so the mic is offered
 * only when it will work: the local Whisper gateway holds a live lease for
 * this environment, or a cloud key is set and not failing on auth or credit.
 */
export async function assistantVoiceAvailability(
  db: TRPCContext["db"],
  tenantId: string,
  env: Environment = process.env,
): Promise<VoiceAvailability> {
  if (env.ASSISTANT_VOICE_ENABLED !== "true")
    return { available: false, provider: null, reason: "off" }
  if (localWhisperEnrolled(tenantId, env)) {
    const row = await readVoiceGateway(db)
    const lease = row?.value as
      | { url?: string; environment?: string; expiresAt?: number }
      | null
      | undefined
    if (
      lease?.url &&
      normalizeGatewayUrl(lease.url) &&
      lease.environment === env.APP_ENV &&
      (lease.expiresAt ?? 0) > Date.now()
    )
      return { available: true, provider: "local_whisper", reason: null }
  }
  if (
    assistantProviderApiKey("OPENAI", env) &&
    (await cloudUsable(db, "openai"))
  )
    return { available: true, provider: "openai", reason: null }
  if (
    (env.ASSISTANT_XAI_API_KEY || env.XAI_API_KEY) &&
    (await cloudUsable(db, "xai"))
  )
    return { available: true, provider: "xai", reason: null }
  return { available: false, provider: null, reason: "no_provider" }
}
