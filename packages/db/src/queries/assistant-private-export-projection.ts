import { createHash } from "node:crypto"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { productWorkflowContextSchema } from "@ewatrade/assistant/product/contracts"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { z } from "zod"

export const ASSISTANT_PRIVATE_EXPORT_LIMITS = {
  conversations: 100,
  messages: 2000,
  entities: 200,
  proposals: 200,
  attachments: 200,
  usage: 2000,
  channelRows: 2000,
  manifestBytes: 2 * 1024 * 1024,
  originalBytes: 16 * 1024 * 1024,
} as const

export class AssistantPrivateExportError extends Error {
  constructor(
    readonly code:
      | "UNAVAILABLE"
      | "PRIVACY_BLOCKED"
      | "SHARED_SCOPE_REVIEW_REQUIRED"
      | "EXPORT_LIMIT"
      | "SCOPE_CHANGED",
  ) {
    super(code)
    this.name = "AssistantPrivateExportError"
  }
}

const textPart = z
  .object({ type: z.literal("text"), text: z.string().max(16000) })
  .strict()
const attachmentPart = z
  .object({
    type: z.literal("data-setup-attachment"),
    data: z
      .object({
        attachmentId: z.string().max(128),
        kind: z.string().max(32),
        fileName: z.string().max(300),
        summary: z.string().max(2000),
        expired: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
const answerPart = z.object({
  type: z.literal("data-general-answer"),
  data: z.object({
    title: z.string().max(160),
    value: z.string().max(160),
    scope: z.string().max(500),
    asOf: z.string().datetime(),
    detail: z.string().max(1000),
  }),
})

const narrativeFields = new Set([
  "text",
  "title",
  "value",
  "scope",
  "detail",
  "summary",
  "transcript",
  "name",
  "description",
  "notes",
  "note",
  "reason",
  "fileName",
])
function redactNarrative(value: string) {
  return value
    .replace(
      /\b(?:Confirm|Cancel)\s+[A-Za-z0-9_-]{43}\b/gi,
      "[decision proof omitted]",
    )
    .replace(
      /\bewa-wa-(?:action|workflow|voice)[^\s]*/gi,
      "[decision proof omitted]",
    )
    .replace(/\b[a-f0-9]{64}\b/gi, "[digest omitted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/gi, "[credential omitted]")
    .replace(/https?:\/\/[^\s]+/gi, "[link omitted]")
}

export type AssistantPrivateExportAttachmentTarget = {
  id: string
  tenantId: string
  conversationId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
  storageProvider: string
  storageStoreId: string
  storagePath: string
  dataClassification: "LIVE" | "QA"
  updatedAt: Date
  retentionUntil: Date
}

/** Input is server-selected storage data, never an authenticated-client DTO. */
export type AssistantPrivateExportSource = {
  conversations: {
    id: string
    ownerUserId: string
    tenantId: string
    storeId: string
    purpose: string
    status: string
    title: string | null
    createdAt: Date
    updatedAt: Date
    workflowContext: unknown
    messages: {
      id: string
      sequence: number
      role: string
      parts: unknown
      createdAt: Date
    }[]
    setupDraft: null | {
      revision: number
      updatedAt: Date
      entities: {
        id: string
        kind: string
        state: string
        payload: unknown
        sortOrder: number
        updatedAt: Date
      }[]
    }
  }[]
  proposals: {
    id: string
    conversationId: string
    actorUserId: string
    action: string
    status: string
    revision: number
    payload: unknown
    updatedAt: Date
  }[]
  attachments: {
    id: string
    conversationId: string
    tenantId: string
    storeId: string
    actorUserId: string
    kind: string
    status: string
    fileName: string
    contentType: string
    sizeBytes: number
    transcript: string | null
    durationMs: number | null
    retentionUntil: Date
    createdAt: Date
    updatedAt: Date
    contentDigest: string
    storageProvider: string | null
    storageStoreId: string | null
    storagePath: string | null
    conversation: {
      ownerUserId: string
      tenant: { dataClassification: "LIVE" | "QA" }
    }
  }[]
  usage: {
    actorUserId: string
    provider: string
    model: string
    requestClass: string
    inputTokens: number | null
    cachedInputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    audioSeconds: number | null
    imageCount: number | null
    outcome: string
    createdAt: Date
  }[]
  identities: {
    id: string
    userId: string
    revokedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }[]
  grants: {
    identityId: string
    tenantId: string
    storeId: string
    consentedAt: Date
    expiresAt: Date
    idleExpiresAt: Date
    revokedAt: Date | null
    updatedAt: Date
    identity: { userId: string }
    membership: { userId: string }
  }[]
  inbox: {
    id: string
    kind: string
    state: string
    receivedAt: Date
    completedAt: Date | null
    updatedAt: Date
    identity: { userId: string } | null
    binding: {
      identity: { userId: string }
      conversation: { ownerUserId: string }
    } | null
  }[]
  outbox: {
    id: string
    inboxId: string
    state: string
    createdAt: Date
    sentAt: Date | null
    deliveredAt: Date | null
    readAt: Date | null
    updatedAt: Date
  }[]
}

function within(count: number, maximum: number) {
  if (count > maximum) throw new AssistantPrivateExportError("EXPORT_LIMIT")
}
function shared() {
  throw new AssistantPrivateExportError("SHARED_SCOPE_REVIEW_REQUIRED")
}

export function projectAssistantPrivateExport(
  source: AssistantPrivateExportSource,
  userId: string,
  now: Date,
) {
  if (!userId || !Number.isFinite(now.getTime()))
    throw new AssistantPrivateExportError("UNAVAILABLE")
  within(
    source.conversations.length,
    ASSISTANT_PRIVATE_EXPORT_LIMITS.conversations,
  )
  within(
    source.conversations.reduce((sum, row) => sum + row.messages.length, 0),
    ASSISTANT_PRIVATE_EXPORT_LIMITS.messages,
  )
  within(
    source.conversations.reduce(
      (sum, row) => sum + (row.setupDraft?.entities.length ?? 0),
      0,
    ),
    ASSISTANT_PRIVATE_EXPORT_LIMITS.entities,
  )
  within(source.proposals.length, ASSISTANT_PRIVATE_EXPORT_LIMITS.proposals)
  within(source.attachments.length, ASSISTANT_PRIVATE_EXPORT_LIMITS.attachments)
  within(source.usage.length, ASSISTANT_PRIVATE_EXPORT_LIMITS.usage)
  within(
    source.identities.length +
      source.grants.length +
      source.inbox.length +
      source.outbox.length,
    ASSISTANT_PRIVATE_EXPORT_LIMITS.channelRows,
  )
  const conversations = new Map(
    source.conversations.map((row) => [row.id, row]),
  )
  const identityIds = new Set(source.identities.map((row) => row.id))
  if (
    source.conversations.some((row) => row.ownerUserId !== userId) ||
    source.proposals.some(
      (row) =>
        row.actorUserId !== userId || !conversations.has(row.conversationId),
    ) ||
    source.attachments.some(
      (row) =>
        row.actorUserId !== userId ||
        row.conversation.ownerUserId !== userId ||
        !conversations.has(row.conversationId) ||
        conversations.get(row.conversationId)?.tenantId !== row.tenantId ||
        conversations.get(row.conversationId)?.storeId !== row.storeId,
    ) ||
    source.usage.some((row) => row.actorUserId !== userId) ||
    source.identities.some((row) => row.userId !== userId) ||
    source.grants.some(
      (row) =>
        row.identity.userId !== userId ||
        row.membership.userId !== userId ||
        !identityIds.has(row.identityId),
    ) ||
    source.inbox.some(
      (row) =>
        (row.identity && row.identity.userId !== userId) ||
        (row.binding &&
          (row.binding.identity.userId !== userId ||
            row.binding.conversation.ownerUserId !== userId)) ||
        (!row.identity && !row.binding),
    )
  )
    shared()
  const inboxIds = new Set(source.inbox.map((row) => row.id))
  if (source.outbox.some((row) => !inboxIds.has(row.inboxId))) shared()
  const exclusions: { category: string; recordId?: string; reason: string }[] =
    [
      {
        category: "shared_business_records",
        reason:
          "Outside this private assistant export; use account data support.",
      },
      {
        category: "channel_credentials_and_proofs",
        reason:
          "Authentication, decision proofs and raw provider payloads are excluded.",
      },
      {
        category: "provider_and_device_copies",
        reason:
          "Copies held by external providers or devices are not retrieved or erased.",
      },
      {
        category: "narrative_redaction",
        reason:
          "Recognizable decision proofs, digests, bearer credentials and links are redacted from narrative fields; arbitrary user-authored prose is not a credential inventory.",
      },
      {
        category: "private_photo_and_extraction",
        reason:
          "Catalog private-photo references and derived extraction objects are excluded; retained original assistant attachments are listed separately.",
      },
    ]
  const attachmentIds = new Set(source.attachments.map((row) => row.id))
  const projectedConversations = source.conversations.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    storeId: row.storeId,
    purpose: row.purpose,
    status: row.status,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map((message) => {
      const parts: (
        | z.infer<typeof textPart>
        | z.infer<typeof attachmentPart>
        | z.infer<typeof answerPart>
      )[] = []
      if (
        !Array.isArray(message.parts) ||
        !["user", "assistant"].includes(message.role)
      ) {
        exclusions.push({
          category: "message_parts",
          recordId: message.id,
          reason: "Unsupported stored message omitted.",
        })
      } else {
        within(message.parts.length, 100)
        for (const part of message.parts) {
          const text = textPart.safeParse(part)
          if (text.success) {
            parts.push(text.data)
            continue
          }
          const attachment = attachmentPart.safeParse(part)
          if (
            attachment.success &&
            attachmentIds.has(attachment.data.data.attachmentId)
          ) {
            parts.push(attachment.data)
            continue
          }
          const answer = answerPart.safeParse(part)
          if (answer.success) {
            parts.push(answer.data)
            continue
          }
          exclusions.push({
            category: "message_parts",
            recordId: message.id,
            reason: "Unsupported or protected structured part omitted.",
          })
        }
      }
      return {
        id: message.id,
        sequence: message.sequence,
        role: ["user", "assistant"].includes(message.role)
          ? message.role
          : "unsupported",
        createdAt: message.createdAt.toISOString(),
        parts,
      }
    }),
    setupDraft: row.setupDraft
      ? {
          revision: row.setupDraft.revision,
          updatedAt: row.setupDraft.updatedAt.toISOString(),
          entities: row.setupDraft.entities.map((entity) => {
            const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
            if (!parsed.success)
              exclusions.push({
                category: "draft_payload",
                recordId: entity.id,
                reason: "Unsupported stored draft payload omitted.",
              })
            const payload = parsed.success ? parsed.data : null
            return {
              id: entity.id,
              kind: entity.kind,
              state: entity.state,
              sortOrder: entity.sortOrder,
              payload:
                payload?.kind === "product"
                  ? (({ photoAttachmentId: _privatePhoto, ...safe }) => safe)(
                      payload,
                    )
                  : payload,
            }
          }),
        }
      : null,
    productForm: (() => {
      if (row.workflowContext == null) return null
      const parsed = productWorkflowContextSchema.safeParse(row.workflowContext)
      if (!parsed.success) {
        exclusions.push({
          category: "workflow_context",
          recordId: row.id,
          reason: "Unsupported stored workflow context omitted.",
        })
        return null
      }
      const { photoAssetIds: _privatePhotos, ...snapshot } =
        parsed.data.snapshot
      return snapshot
    })(),
  }))
  const proposals = source.proposals.map((row) => {
    const parsed = generalActionSchema.safeParse(row.payload)
    if (!parsed.success)
      exclusions.push({
        category: "proposal_payload",
        recordId: row.id,
        reason: "Unsupported stored proposal payload omitted.",
      })
    return {
      id: row.id,
      conversationId: row.conversationId,
      action: row.action,
      status: row.status,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
      payload: parsed.success
        ? parsed.data.action === "product_create"
          ? (({ photoAssetId: _privatePhoto, ...safe }) => safe)(parsed.data)
          : parsed.data
        : null,
    }
  })
  const attachments: AssistantPrivateExportAttachmentTarget[] = []
  let originalBytes = 0
  const publicAttachments = source.attachments.map((row) => {
    if (!Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0)
      throw new AssistantPrivateExportError("UNAVAILABLE")
    const retained =
      row.retentionUntil > now &&
      row.storagePath &&
      row.storageProvider &&
      row.storageStoreId &&
      /^[a-f0-9]{64}$/.test(row.contentDigest)
    const availability =
      row.retentionUntil <= now
        ? "expired"
        : retained
          ? "retained"
          : "unavailable"
    if (
      retained &&
      row.storagePath &&
      row.storageProvider &&
      row.storageStoreId
    ) {
      originalBytes += row.sizeBytes
      within(originalBytes, ASSISTANT_PRIVATE_EXPORT_LIMITS.originalBytes)
      attachments.push({
        id: row.id,
        tenantId: row.tenantId,
        conversationId: row.conversationId,
        contentDigest: row.contentDigest,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        storagePath: row.storagePath,
        storageProvider: row.storageProvider,
        storageStoreId: row.storageStoreId,
        dataClassification: row.conversation.tenant.dataClassification,
        updatedAt: row.updatedAt,
        retentionUntil: row.retentionUntil,
      })
    }
    return {
      id: row.id,
      conversationId: row.conversationId,
      kind: row.kind,
      status: row.status,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      durationMs: row.durationMs,
      transcript: row.retentionUntil > now ? row.transcript : null,
      createdAt: row.createdAt.toISOString(),
      retentionUntil: row.retentionUntil.toISOString(),
      original: {
        availability,
        reason:
          availability === "retained"
            ? "Original object requires authenticated server read."
            : availability === "expired"
              ? "Original retention expired."
              : "Original storage ownership unavailable.",
      },
    }
  })
  const manifest = {
    version: 1 as const,
    generatedAt: now.toISOString(),
    scope: "own_private_assistant" as const,
    conversations: projectedConversations,
    proposals,
    attachments: publicAttachments,
    usage: source.usage.map((row) => ({
      provider: row.provider,
      model: row.model,
      requestClass: row.requestClass,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      audioSeconds: row.audioSeconds,
      imageCount: row.imageCount,
      outcome: row.outcome,
      createdAt: row.createdAt.toISOString(),
    })),
    channel: {
      connections: source.identities.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
      grants: source.grants.map((row) => ({
        tenantId: row.tenantId,
        storeId: row.storeId,
        consentedAt: row.consentedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        idleExpiresAt: row.idleExpiresAt.toISOString(),
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
      inbound: source.inbox.map((row) => ({
        id: row.id,
        kind: row.kind,
        state: row.state,
        receivedAt: row.receivedAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
      delivery: source.outbox.map((row) => ({
        id: row.id,
        inboxId: row.inboxId,
        state: row.state,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
        readAt: row.readAt?.toISOString() ?? null,
      })),
    },
    exclusions,
  }
  // Only explicit display strings change. Stable record identities and exact decimal values are preserved.
  const serialized = JSON.stringify(manifest, (key, value: unknown) =>
    typeof value === "string" && narrativeFields.has(key)
      ? redactNarrative(value)
      : value,
  )
  within(
    new TextEncoder().encode(serialized).byteLength,
    ASSISTANT_PRIVATE_EXPORT_LIMITS.manifestBytes,
  )
  // Protected internal snapshot also detects a proof/source change even when the public projection is unchanged.
  const snapshotDigest = createHash("sha256")
    .update(
      JSON.stringify({
        source,
        availableOriginalIds: attachments.map((row) => row.id),
      }),
    )
    .digest("hex")
  const safeManifest: typeof manifest = JSON.parse(serialized)
  return { manifest: safeManifest, attachments, snapshotDigest }
}
