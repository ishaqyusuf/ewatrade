import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  createOpenAIMediaAdapters,
  createRehearsalMediaAdapters,
} from "@ewatrade/ai/media"
import { createFallbackTranscriber } from "@ewatrade/ai/transcription"
import {
  TranscriptionError,
  gatewayLeaseSchema,
} from "@ewatrade/ai/transcription-contracts"
import {
  SETUP_ATTACHMENT_LEASE_MS,
  SETUP_ATTACHMENT_MAX_ATTEMPTS,
  type SetupAttachmentProcessingDeps,
  processSetupAttachment,
} from "@ewatrade/assistant/setup/attachment-processing"
import {
  SETUP_REHEARSAL_TRANSCRIPT,
  setupRehearsalImageRead,
} from "@ewatrade/assistant/setup/vision"
import { processCatalogPhoto } from "@ewatrade/catalog/photo-processing"
import {
  assistantBudgetScopeKey,
  recordAssistantAttachmentUsage,
  reserveAssistantMediaBudget,
} from "@ewatrade/db/assistant"
import {
  claimAssistantAttachmentProcessing,
  completeAssistantAttachmentProcessing,
  failAssistantAttachmentProcessing,
} from "@ewatrade/db/assistant-attachments"
import {
  assertVoiceAttemptActive,
  readVoiceGateway,
  recordVoiceAttempt,
  reserveVoiceAudio,
  voiceCircuitOpen,
} from "@ewatrade/db/assistant-voice"
import { prisma } from "@ewatrade/db/client"
import {
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"

export type AssistantAttachmentProcessPayload = { attachmentId: string }

/** Owner-approved setup allowance (S00-04): 20 audio minutes, 40 photos. */
export const SETUP_MEDIA_BUDGET_LIMITS = {
  maxAudioSeconds: 20 * 60,
  maxVisionImages: 40,
  windowMs: 30 * 24 * 60 * 60 * 1000,
}

async function dataClassification(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dataClassification: true },
  })
  if (!tenant) throw new Error("Tenant not found for attachment processing.")
  return tenant.dataClassification
}

function heicWorkerUrl() {
  const packaged = resolve(process.cwd(), "catalog/src/photo-heic-worker.mjs")
  return existsSync(packaged) ? pathToFileURL(packaged) : undefined
}

export function defaultAssistantAttachmentDeps(): SetupAttachmentProcessingDeps {
  const classifications = new Map<string, "LIVE" | "QA">()
  const classify = async (tenantId: string) => {
    const cached = classifications.get(tenantId)
    if (cached) return cached
    const value = await dataClassification(tenantId)
    classifications.set(tenantId, value)
    return value
  }
  const scopeKey = (tenantId: string) =>
    assistantBudgetScopeKey(tenantId, "SETUP")
  return {
    claim: async (attachmentId) => {
      const row = await claimAssistantAttachmentProcessing(prisma, {
        attachmentId,
        leaseMs: SETUP_ATTACHMENT_LEASE_MS,
        maxAttempts: SETUP_ATTACHMENT_MAX_ATTEMPTS,
      })
      if (row?.kind === "AUDIO" && row.processingAttempts > 1) {
        const interrupted =
          await prisma.assistantTranscriptionAttempt.updateMany({
            where: {
              attachmentId: row.id,
              generation: { lt: row.processingAttempts },
              outcome: "started",
              billingStatus: "unknown",
            },
            data: {
              outcome: "failed",
              errorCode: "UNKNOWN_OUTCOME",
              completedAt: new Date(),
            },
          })
        if (interrupted.count) {
          await failAssistantAttachmentProcessing(prisma, {
            attachmentId: row.id,
            generation: row.processingAttempts,
            errorCode: "UNKNOWN_OUTCOME",
            retryable: false,
          })
          return null
        }
      }
      return row
        ? {
            id: row.id,
            tenantId: row.tenantId,
            conversationId: row.conversationId,
            actorUserId: row.actorUserId,
            kind: row.kind,
            contentType: row.contentType,
            contentDigest: row.contentDigest,
            sizeBytes: row.sizeBytes,
            durationMs: row.durationMs,
            processingAttempts: row.processingAttempts,
          }
        : null
    },
    readBytes: async (attachment) => {
      const classification = await classify(attachment.tenantId)
      const storage = createAssistantAttachmentStorage(
        resolveAssistantAttachmentStorage(classification),
        classification,
      )
      return storage.read({
        target: {
          tenantId: attachment.tenantId,
          conversationId: attachment.conversationId,
          attachmentId: attachment.id,
          contentDigest: attachment.contentDigest,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        },
      })
    },
    // QA data only ever reaches the rehearsal (test) adapters.
    media: async (attachment) => {
      const classification = await classify(attachment.tenantId)
      if (classification === "QA") {
        const decision = evaluateQaProviderPolicy({
          adapter: "test",
          operation: "ai_analysis",
          tenantDataClassification: classification,
        })
        return decision.allowed
          ? createRehearsalMediaAdapters({
              transcript: SETUP_REHEARSAL_TRANSCRIPT,
              image: () => setupRehearsalImageRead(),
            })
          : null
      }
      const media = createOpenAIMediaAdapters()
      if (attachment.kind !== "AUDIO") return media
      return {
        readImage:
          media?.readImage ??
          (async () => {
            throw new Error("MEDIA_UNAVAILABLE")
          }),
        transcribe: createFallbackTranscriber({
          contentType: attachment.contentType,
          audioSeconds: Math.ceil((attachment.durationMs ?? 0) / 1000),
          tenantId: attachment.tenantId,
          digest: attachment.contentDigest,
          gateway: async () => {
            const parsed = gatewayLeaseSchema.safeParse(
              (await readVoiceGateway(prisma))?.value,
            )
            return parsed.success ? parsed.data : null
          },
          assertActive: async () => {
            if (process.env.ASSISTANT_VOICE_ENABLED !== "true")
              throw new TranscriptionError("VOICE_DISABLED", true)
            try {
              await assertVoiceAttemptActive(
                prisma,
                attachment.id,
                attachment.processingAttempts,
              )
            } catch {
              throw new TranscriptionError("VOICE_CANCELLED", true)
            }
          },
          recordAttempt: (attempt) =>
            recordVoiceAttempt(prisma, {
              ...attempt,
              attachmentId: attachment.id,
              generation: attachment.processingAttempts,
              audioSeconds: Math.ceil((attachment.durationMs ?? 0) / 1000),
            }),
          circuitOpen: (provider, model) =>
            voiceCircuitOpen(prisma, provider, model),
        }),
      }
    },
    prepareImage: async (bytes, contentType) => {
      const processed = await processCatalogPhoto({
        bytes,
        contentType: contentType as Parameters<
          typeof processCatalogPhoto
        >[0]["contentType"],
        heicWorkerUrl: heicWorkerUrl(),
      })
      return { bytes: processed.display.bytes, mediaType: "image/webp" }
    },
    reserveMedia: async (attachment, request) =>
      attachment.kind === "AUDIO"
        ? reserveVoiceAudio(
            prisma,
            attachment.id,
            request.audioSeconds ?? 0,
            attachment.processingAttempts,
          )
        : (
            await reserveAssistantMediaBudget(prisma, {
              scopeKey: scopeKey(attachment.tenantId),
              limits: SETUP_MEDIA_BUDGET_LIMITS,
              audioSeconds: request.audioSeconds,
              images: request.images,
            })
          ).allowed,
    recordUsage: async (attachment, usage) => {
      if (
        attachment.kind === "AUDIO" &&
        (await classify(attachment.tenantId)) === "QA"
      ) {
        await recordVoiceAttempt(prisma, {
          attachmentId: attachment.id,
          generation: attachment.processingAttempts,
          ordinal: 1,
          provider: "rehearsal",
          model: usage.model,
          outcome: "success",
          audioSeconds: usage.audioSeconds ?? 0,
          durationMs: usage.durationMs,
          billingStatus: "not_billable",
          estimatedCostMicros: 0n,
        })
      }
      await recordAssistantAttachmentUsage(prisma, {
        attachmentId: attachment.id,
        tenantId: attachment.tenantId,
        actorUserId: attachment.actorUserId,
        provider: usage.provider,
        model: usage.model,
        requestClass: usage.requestClass,
        outcome: usage.outcome,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        audioSeconds: usage.audioSeconds,
        imageCount: usage.imageCount,
        durationMs: usage.durationMs,
        budgetScopeKey: scopeKey(attachment.tenantId),
      })
    },
    complete: (input) =>
      completeAssistantAttachmentProcessing(prisma, {
        attachmentId: input.attachmentId,
        generation: input.generation,
        transcript: input.transcript,
        extraction: input.extraction,
        durationMs: input.durationMs,
      }),
    fail: (input) => failAssistantAttachmentProcessing(prisma, input),
  }
}

/** Identifier-only payload; every fact is re-read from the database. */
export async function assistantAttachmentProcessHandler(
  payload: AssistantAttachmentProcessPayload,
) {
  const result = await processSetupAttachment(
    payload.attachmentId,
    defaultAssistantAttachmentDeps(),
  )
  if (result.status === "failed" && result.retryable)
    // Let the queue retry; the lease and attempt counter bound it.
    throw new Error("Assistant attachment processing will be retried.")
}
