import { createHash } from "node:crypto"
import {
  WHATSAPP_MEDIA_FAILED,
  WHATSAPP_MEDIA_UNSUPPORTED,
  renderWhatsAppVoiceReview,
  whatsAppMediaContentSchema,
  whatsAppMediaPolicy,
} from "@ewatrade/assistant/channels/media"
import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENT_PART,
  SETUP_ATTACHMENT_RETENTION_MS,
  SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
  type SetupAttachmentKind,
  assistantAttachmentKindAllowedForPurpose,
  validateSetupAttachmentIntent,
} from "@ewatrade/assistant/setup/attachments"
import type { AssistantScope } from "@ewatrade/db/assistant"
import {
  type AssistantAttachmentRecord,
  assistantAttachmentRequestId,
} from "@ewatrade/db/assistant-attachments"
import {
  assistantWhatsAppMediaClientRequestId,
  pinAssistantWhatsAppMediaSourceInTransaction,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { acceptsAssistantAttachmentBytes } from "@ewatrade/private-media/assistant-attachments"
import type { GeneralTransactionContext } from "../general-actions"
import type { GeneralContext } from "../general-context"
import type { GeneralTurnInput } from "../general-turn-contract"

type Scope = AssistantScope & { dataClassification: "LIVE" | "QA" }
type Policy = NonNullable<ReturnType<typeof whatsAppMediaPolicy>>
type Intent = Policy & {
  conversationId: string
  clientRequestId: string
  sizeBytes: number
  contentDigest: string
  durationMs?: number
}
type Storage = ReturnType<
  typeof import("../attachment-storage").setupAttachmentStorage
>
export type WhatsAppMediaIngestDependencies = {
  enabled(): boolean
  allows(policy: Policy, scope: Scope): Promise<boolean>
  authorize(): Promise<{
    scope: Scope
    conversationId: string
    phoneNumberId: string
  }>
  read(attachmentId: string): Promise<AssistantAttachmentRecord | null>
  createIntent(input: Intent): Promise<AssistantAttachmentRecord>
  download(input: {
    mediaId: string
    maxBytes: number
    expectedMediaType: string
    expectedSha256?: string
    signal?: AbortSignal
  }): Promise<{ bytes: Uint8Array; mediaType: string }>
  audioDuration(bytes: Uint8Array, contentType: string): Promise<number>
  voiceAvailable(): Promise<boolean>
  storage(scope: Scope): Storage
  pin(row: AssistantAttachmentRecord, storage: Storage): Promise<boolean>
  uploaded(
    row: AssistantAttachmentRecord,
    storage: Storage,
    durationMs?: number,
  ): Promise<boolean>
  enqueue(attachmentId: string): Promise<unknown>
  now(): Date
}
export type WhatsAppMediaIngestResult =
  | {
      state: "ready"
      attachmentId: string
      kind: Policy["kind"]
      parts: GeneralTurnInput["message"]["parts"]
    }
  | { state: "processing"; attachmentId: string }
  | {
      state: "voice_review"
      attachmentId: string
      transcript: string
      transcriptDigest: string
      processingGeneration: number
    }
  | { state: "refused"; code: string; message: string }

const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex")
const refused = (
  code: string,
  message = WHATSAPP_MEDIA_FAILED,
): WhatsAppMediaIngestResult => ({ state: "refused", code, message })

/** Channel photos are original attachments in GENERAL; image reading is deferred. */
export function whatsAppAttachmentKindAllowedForPurpose(
  kind: SetupAttachmentKind,
  purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE",
) {
  return (
    assistantAttachmentKindAllowedForPurpose(kind, purpose) &&
    (kind === "AUDIO" ||
      (purpose !== "PRODUCT_CREATE" &&
        (kind !== "IMAGE" || purpose === "GENERAL")))
  )
}

/** Injectable I/O; never accepts an actor, workspace or download URL from ingress. */
export function createWhatsAppMediaIngestor(
  deps: WhatsAppMediaIngestDependencies,
) {
  return async (input: {
    providerMessageId: string
    content: unknown
    signal?: AbortSignal
  }): Promise<WhatsAppMediaIngestResult> => {
    if (!deps.enabled()) return refused("MEDIA_DISABLED")
    const parsed = whatsAppMediaContentSchema.safeParse(input.content)
    if (
      !parsed.success ||
      !input.providerMessageId ||
      input.providerMessageId.length > 256
    )
      return refused("INVALID_MEDIA")
    const policy = whatsAppMediaPolicy(parsed.data.media)
    if (!policy) return refused("UNSUPPORTED_MEDIA", WHATSAPP_MEDIA_UNSUPPORTED)
    const { scope, conversationId, phoneNumberId } = await deps.authorize()
    if (!(await deps.allows(policy, scope)))
      return refused("MEDIA_NOT_AVAILABLE", WHATSAPP_MEDIA_UNSUPPORTED)
    const clientRequestId = assistantWhatsAppMediaClientRequestId(
      phoneNumberId,
      input.providerMessageId,
      parsed.data.media.id,
    )
    const attachmentId = assistantAttachmentRequestId(
      scope,
      conversationId,
      clientRequestId,
    )
    let row = await deps.read(attachmentId)
    if (
      row &&
      (row.conversationId !== conversationId ||
        row.tenantId !== scope.tenantId ||
        row.storeId !== scope.storeId ||
        row.actorUserId !== scope.userId ||
        row.contentType !== policy.contentType ||
        row.kind !== policy.kind ||
        row.retentionUntil <= deps.now() ||
        row.messageId)
    )
      return refused("ATTACHMENT_UNAVAILABLE")
    if (row?.status === "PENDING_UPLOAD" && row.uploadExpiresAt <= deps.now())
      return refused("UPLOAD_EXPIRED")
    if (!row || row.status === "PENDING_UPLOAD") {
      if (policy.kind === "AUDIO" && !(await deps.voiceAvailable()))
        return refused("VOICE_UNAVAILABLE")
      const storage = deps.storage(scope)
      storage.assertAvailable()
      const downloaded = await deps.download({
        mediaId: parsed.data.media.id,
        maxBytes: policy.maxBytes,
        expectedMediaType: policy.contentType,
        expectedSha256: parsed.data.media.sha256,
        signal: input.signal,
      })
      if (
        downloaded.mediaType !== policy.contentType ||
        !validateSetupAttachmentIntent({
          contentType: policy.contentType,
          sizeBytes: downloaded.bytes.byteLength,
        }).ok ||
        !acceptsAssistantAttachmentBytes(downloaded.bytes, policy.contentType)
      )
        return refused("INVALID_MEDIA")
      let durationMs: number | undefined
      if (policy.kind === "AUDIO") {
        durationMs = await deps.audioDuration(
          downloaded.bytes,
          policy.contentType,
        )
        if (
          !Number.isFinite(durationMs) ||
          durationMs < 1 ||
          durationMs > 120_000
        )
          return refused("INVALID_AUDIO")
      }
      const contentDigest = sha256(downloaded.bytes)
      if (
        row &&
        (row.contentDigest !== contentDigest ||
          row.sizeBytes !== downloaded.bytes.byteLength)
      )
        return refused("MEDIA_CHANGED")
      // Recheck the captured linked scope after HTTP before any private write.
      await deps.authorize()
      row = await deps.createIntent({
        ...policy,
        conversationId,
        clientRequestId,
        contentDigest,
        sizeBytes: downloaded.bytes.byteLength,
        durationMs,
      })
      if (row.status === "PENDING_UPLOAD") {
        if (
          row.uploadExpiresAt <= deps.now() ||
          !storage.storeId ||
          !(await deps.pin(row, storage))
        )
          return refused("UPLOAD_EXPIRED")
        const target = {
          tenantId: row.tenantId,
          conversationId: row.conversationId,
          attachmentId: row.id,
          contentDigest: row.contentDigest,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
        }
        await storage.stage({
          target,
          bytes: downloaded.bytes,
          abortSignal: input.signal,
        })
        // Pinning precedes the write, so failures remain attributable to the canonical attachment.
        let saved = false
        try {
          await deps.authorize()
          saved = await deps.uploaded(row, storage, durationMs)
        } finally {
          if (!saved) await storage.remove({ target }).catch(() => undefined)
        }
        if (!saved) return refused("UPLOAD_EXPIRED")
        await deps.enqueue(row.id).catch(() => undefined)
        return { state: "processing", attachmentId: row.id }
      }
    }
    if (
      row.conversationId !== conversationId ||
      row.tenantId !== scope.tenantId ||
      row.storeId !== scope.storeId ||
      row.actorUserId !== scope.userId ||
      row.contentType !== policy.contentType ||
      row.kind !== policy.kind ||
      row.retentionUntil <= deps.now() ||
      row.messageId
    )
      return refused("ATTACHMENT_UNAVAILABLE")
    if (row.status === "UPLOADED" || row.status === "PROCESSING")
      return { state: "processing", attachmentId: row.id }
    if (row.status !== "READY") return refused("PROCESSING_FAILED")
    if (row.kind === "AUDIO") {
      if (!row.transcript || !renderWhatsAppVoiceReview(row.transcript))
        return refused("TRANSCRIPT_REQUIRES_APP")
      return {
        state: "voice_review",
        attachmentId: row.id,
        transcript: row.transcript,
        transcriptDigest: sha256(row.transcript),
        processingGeneration: row.processingAttempts,
      }
    }
    const parts: GeneralTurnInput["message"]["parts"] = []
    if (parsed.data.text?.trim())
      parts.push({ type: "text", text: parsed.data.text.trim() })
    parts.push({ type: SETUP_ATTACHMENT_PART, data: { attachmentId: row.id } })
    return { state: "ready", attachmentId: row.id, kind: row.kind, parts }
  }
}

/** Actual canonical adapters; tests may replace external download/enqueue only. */
export async function createDefaultWhatsAppMediaIngestDependencies(
  ctx: GeneralContext,
): Promise<WhatsAppMediaIngestDependencies | null> {
  const [
    {
      isLinkedAssistantIdentity,
      resolveLinkedAssistantIdentity,
      lockLinkedAssistantIdentity,
    },
    { requireGeneralScope },
    { inFreshGeneralTransaction },
    attachments,
    communications,
    { whatsAppChannelPolicy },
    { setupAttachmentStorage, setupAttachmentTarget },
    { assistantAttachmentStoragePath },
    { enqueueAssistantAttachmentProcessing },
    { assistantVoiceAvailability },
    { parseBuffer },
    { assertQaProviderAllowed },
    { requireSetupAssistantScope },
    { inFreshLinkedWorkflowTransaction },
    { whatsAppWorkflowEnabled },
    { assistantMediaAvailability },
  ] = await Promise.all([
    import("../channel-principal"),
    import("../general-context"),
    import("../general-proposals"),
    import("@ewatrade/db/assistant-attachments"),
    import("@ewatrade/communications"),
    import("@ewatrade/assistant/channels/policy"),
    import("../attachment-storage"),
    import("@ewatrade/private-media/assistant-attachments"),
    import("@ewatrade/jobs/assistant-attachments"),
    import("../voice-availability"),
    import("music-metadata"),
    import("@ewatrade/utils/qa-provider-policy"),
    import("../setup-context"),
    import("../channel-workflow-turn"),
    import("@ewatrade/assistant/channels/workflow"),
    import("../media-availability"),
  ])
  if (
    !isLinkedAssistantIdentity(ctx.session) ||
    !ctx.session.inboxLease ||
    !ctx.assistantConversationId
  )
    return null
  const identity = ctx.session
  const lease = ctx.session.inboxLease
  const purpose = identity.purpose
  const scopeFor = (current: GeneralContext | GeneralTransactionContext) =>
    purpose === "GENERAL"
      ? requireGeneralScope(current)
      : requireSetupAssistantScope({
          ...ctx,
          session: current.session,
          tenantContext: current.tenantContext,
        })
  const captured = scopeFor(ctx)
  const transaction = <T>(
    operation: (fresh: GeneralTransactionContext) => Promise<T>,
  ) =>
    purpose === "GENERAL"
      ? inFreshGeneralTransaction(ctx, operation)
      : inFreshLinkedWorkflowTransaction(ctx, operation)
  const authorize: WhatsAppMediaIngestDependencies["authorize"] = async () => {
    const fresh = await resolveLinkedAssistantIdentity(
      ctx.db,
      identity.principal,
      identity.inboxLease,
    )
    if (
      fresh.conversation.id !== ctx.assistantConversationId ||
      fresh.conversation.purpose !== purpose ||
      fresh.scope.tenantId !== captured.tenantId ||
      fresh.scope.storeId !== captured.storeId ||
      fresh.scope.userId !== captured.userId ||
      (purpose !== "GENERAL" && !whatsAppWorkflowEnabled(purpose))
    )
      throw Error("WhatsApp media scope changed.")
    return {
      scope: scopeFor({
        ...ctx,
        session: fresh.identity,
        tenantContext: fresh.tenantContext,
      }),
      conversationId: fresh.conversation.id,
      phoneNumberId: identity.principal.phoneNumberId,
    }
  }
  return {
    allows: async (policy, scope) => {
      if (!whatsAppAttachmentKindAllowedForPurpose(policy.kind, purpose))
        return false
      if (policy.kind === "AUDIO") return true
      const available = assistantMediaAvailability(
        scope.dataClassification,
        process.env,
        undefined,
        purpose === "GENERAL",
      )
      return policy.kind === "IMAGE" ? available.photos : available.files
    },
    enabled: () =>
      Boolean(communications.readAssistantWhatsAppConfig()) &&
      whatsAppChannelPolicy().media &&
      (purpose === "GENERAL" || whatsAppWorkflowEnabled(purpose)),
    authorize,
    now: () => new Date(),
    read: async (id) => {
      try {
        return await attachments.readAssistantAttachment(ctx.db, captured, id)
      } catch (error) {
        if (
          error instanceof attachments.AssistantAttachmentError &&
          error.code === "ATTACHMENT_NOT_FOUND"
        )
          return null
        throw error
      }
    },
    createIntent: (intent) =>
      transaction(async (fresh) => {
        if (!isLinkedAssistantIdentity(fresh.session))
          throw Error("WhatsApp media authority changed.")
        // GENERAL media runs before normal turn admission. Pin its actual
        // authority here, retaining identity/inbox-before-attachment lock order.
        const resolved = await lockLinkedAssistantIdentity(
          fresh.db,
          fresh.session,
        )
        await stampAssistantWhatsAppExecution(fresh.db, lease, resolved)
        const row =
          await attachments.createAssistantAttachmentIntentInTransaction(
            fresh.db,
            scopeFor(fresh),
            {
              ...intent,
              maxPerConversation: SETUP_ATTACHMENTS_PER_CONVERSATION,
              uploadWindowMs: SETUP_ATTACHMENT_UPLOAD_WINDOW_MS,
              retentionMs: SETUP_ATTACHMENT_RETENTION_MS,
            },
          )
        await pinAssistantWhatsAppMediaSourceInTransaction(fresh.db, {
          principal: identity.principal,
          lease,
          attachmentId: row.id,
        })
        return row
      }),
    download: async (request) => {
      const { scope } = await authorize()
      assertQaProviderAllowed({
        adapter: "live",
        operation: "whatsapp",
        tenantDataClassification: scope.dataClassification,
      })
      const config = communications.readAssistantWhatsAppConfig()
      if (!config || config.phoneNumberId !== identity.principal.phoneNumberId)
        throw Error("WhatsApp media unavailable.")
      return new communications.DirectMetaWhatsAppProvider().fetchMedia({
        ...config,
        ...request,
      })
    },
    voiceAvailable: async () =>
      (await assistantVoiceAvailability(ctx.db)).available,
    audioDuration: async (bytes, contentType) => {
      const metadata = await parseBuffer(
        bytes,
        { mimeType: contentType, size: bytes.byteLength },
        { duration: true, skipCovers: true },
      )
      return Math.ceil((metadata.format.duration ?? 0) * 1000)
    },
    storage: (scope) => setupAttachmentStorage(scope.dataClassification),
    pin: (row, storage) =>
      attachments.pinAssistantAttachmentStorage(ctx.db, captured, {
        attachmentId: row.id,
        storageProvider: storage.provider,
        storageStoreId: storage.storeId ?? "",
        storagePath: assistantAttachmentStoragePath(setupAttachmentTarget(row)),
      }),
    uploaded: (row, storage, durationMs) =>
      transaction((fresh) =>
        attachments.markAssistantAttachmentUploaded(fresh.db, {
          attachmentId: row.id,
          storageProvider: storage.provider,
          storageStoreId: storage.storeId,
          storagePath: assistantAttachmentStoragePath(
            setupAttachmentTarget(row),
          ),
          durationMs,
        }),
      ),
    enqueue: (id) => enqueueAssistantAttachmentProcessing(id),
  }
}

/** Actual canonical intent/storage/job adapters; no browser Session is invented. */
export async function ingestAssistantWhatsAppMedia(input: {
  ctx: GeneralContext
  providerMessageId: string
  content: unknown
  signal?: AbortSignal
}): Promise<WhatsAppMediaIngestResult> {
  const deps = await createDefaultWhatsAppMediaIngestDependencies(input.ctx)
  return deps ? createWhatsAppMediaIngestor(deps)(input) : refused("UNLINKED")
}
