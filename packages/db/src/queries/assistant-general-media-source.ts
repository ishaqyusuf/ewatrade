import { type Hash, createHash } from "node:crypto"
import {
  setupPagesExtractionSchema,
  setupTranscriptExtractionSchema,
} from "@ewatrade/assistant/setup/attachments"
import { canOperatePos } from "@ewatrade/auth/roles"
import { canStaffAccessStore } from "@ewatrade/auth/store-access"
import { z } from "zod"
import type { Prisma } from "../../generated/prisma/client"
import type { AssistantScope } from "./assistant"
import { generalConversationWhere } from "./assistant-general"
import { readStaffStoreAccess } from "./staff-store-access"

const id = (max: number) => z.string().min(1).max(max)
const inputSchema = z
  .object({
    scope: z
      .object({ userId: id(128), tenantId: id(128), storeId: id(128) })
      .strict(),
    conversationId: id(128),
    messageId: id(80),
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("message"),
          partIndex: z.number().int().min(0).max(7),
        })
        .strict(),
      z
        .object({
          kind: z.literal("attachment"),
          partIndex: z.number().int().min(0).max(7),
          attachmentId: id(64),
        })
        .strict(),
    ]),
  })
  .strict()
export type AssistantGeneralMediaSourceInput = z.infer<typeof inputSchema>
type Pages = z.infer<typeof setupPagesExtractionSchema>
type Transcript = z.infer<typeof setupTranscriptExtractionSchema>
type Origin = {
  actorUserId: string
  tenantId: string
  storeId: string
  conversationId: string
}
/** Structurally compatible with GeneralMediaCurrentSource, without importing
 * GENERAL contracts (which themselves import domain/read contracts).
 * Private original text: never pass this entire object to model tools/logs.
 */
export type AssistantGeneralMediaCurrentSource = {
  origin: Origin
  messageId: string
} & (
  | { kind: "message"; partIndex: number; text: string; textDigest: string }
  | {
      kind: "attachment"
      attachmentId: string
      attachmentKind: "AUDIO" | "PDF" | "IMAGE"
      status: "READY"
      processingGeneration: number
      contentDigest: string
      extractionDigest: string
      retentionUntil: string
      transcript: string | null
      extraction: Pages | Transcript | null
    }
)
export class AssistantGeneralMediaSourceError extends Error {
  constructor(readonly code: "FORBIDDEN" | "UNAVAILABLE") {
    super("This original assistant source is unavailable.")
    this.name = "AssistantGeneralMediaSourceError"
  }
}
function unavailable(): never {
  throw new AssistantGeneralMediaSourceError("UNAVAILABLE")
}
function forbidden(): never {
  throw new AssistantGeneralMediaSourceError("FORBIDDEN")
}
function record(value: Prisma.JsonValue | undefined) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null
}
function hashJson(hash: Hash, value: unknown): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    hash.update(JSON.stringify(value))
    return
  }
  if (typeof value !== "object") unavailable()
  if (Array.isArray(value)) {
    hash.update("[")
    value.forEach((entry, index) => {
      if (index) hash.update(",")
      hashJson(hash, entry)
    })
    hash.update("]")
    return
  }
  // Prisma JSON data, not arbitrary objects with toJSON/getter callbacks.
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    unavailable()
  hash.update("{")
  Object.keys(value)
    .sort()
    .forEach((key, index) => {
      const entry = Object.getOwnPropertyDescriptor(value, key)
      if (!entry || !("value" in entry) || entry.value === undefined)
        unavailable()
      if (index) hash.update(",")
      hash.update(JSON.stringify(key)).update(":")
      hashJson(hash, entry.value)
    })
  hash.update("}")
}
function extractionDigest(
  transcript: string | null,
  extraction: Prisma.JsonValue,
) {
  const hash = createHash("sha256")
  hashJson(hash, { transcript, extraction })
  return hash.digest("hex")
}
async function authority(tx: Prisma.TransactionClient, scope: AssistantScope) {
  const [user, tenant, store, member] = await Promise.all([
    tx.user.findFirst({
      where: {
        id: scope.userId,
        accountPrivacyRequests: {
          none: { status: { in: ["PROCESSING", "COMPLETED"] } },
        },
      },
      select: { id: true },
    }),
    tx.tenant.findFirst({
      where: { id: scope.tenantId, isActive: true, qaPurgeStartedAt: null },
      select: { id: true, isActive: true, qaPurgeStartedAt: true },
    }),
    tx.store.findFirst({
      where: { id: scope.storeId, tenantId: scope.tenantId, status: "ACTIVE" },
      select: { id: true, tenantId: true, status: true },
    }),
    tx.membership.findFirst({
      where: {
        userId: scope.userId,
        tenantId: scope.tenantId,
        status: "ACTIVE",
        tenant: { isActive: true },
      },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        role: true,
        status: true,
      },
    }),
  ])
  if (
    !user ||
    user.id !== scope.userId ||
    !tenant ||
    tenant.id !== scope.tenantId ||
    !tenant.isActive ||
    tenant.qaPurgeStartedAt !== null ||
    !store ||
    store.id !== scope.storeId ||
    store.tenantId !== scope.tenantId ||
    store.status !== "ACTIVE" ||
    !member ||
    member.userId !== scope.userId ||
    member.tenantId !== scope.tenantId ||
    member.status !== "ACTIVE" ||
    !canOperatePos(member.role)
  )
    forbidden()
  const access = await readStaffStoreAccess(tx, member.id, scope.tenantId)
  if (
    !access ||
    access.role !== member.role ||
    access.status !== "ACTIVE" ||
    !Number.isSafeInteger(access.staffAccessRevision) ||
    access.staffAccessRevision < 1 ||
    !canStaffAccessStore(
      {
        businessRole: access.role,
        status: access.status,
        mode: access.staffAccessMode,
        catalogEditor: access.catalogEditor,
        assignments: access.staffStoreAssignments,
      },
      scope.storeId,
    )
  )
    forbidden()
}
const pagesSchema = setupPagesExtractionSchema.strict().extend({
  pages: z
    .array(setupPagesExtractionSchema.shape.pages.element.strict())
    .max(20),
})

/** Caller owns a consistent read transaction and supplies scope from an actual
 * fresh protected principal/current Store, never model/client authority fields.
 * This checks persisted scope/privacy, not Session validity, age/legal eligibility,
 * rollout, a human Use/Edit choice, or command authority. Those remain upstream.
 * Re-resolve in the owning review/confirmation transaction; do not cache as proof.
 * No private-write helper: its processing flag is not a privacy-read exemption.
 */
export async function readAssistantGeneralMediaSourceInTransaction(
  tx: Prisma.TransactionClient,
  raw: AssistantGeneralMediaSourceInput,
): Promise<AssistantGeneralMediaCurrentSource> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) unavailable()
  const input = structuredClone(parsed.data)
  const { scope } = input
  await authority(tx, scope)
  const conversationWhere = {
    ...generalConversationWhere(scope),
    id: input.conversationId,
  }
  const conversation = await tx.assistantConversation.findFirst({
    where: conversationWhere,
    select: {
      id: true,
      ownerUserId: true,
      tenantId: true,
      storeId: true,
      purpose: true,
      status: true,
    },
  })
  if (
    !conversation ||
    conversation.id !== input.conversationId ||
    conversation.ownerUserId !== scope.userId ||
    conversation.tenantId !== scope.tenantId ||
    conversation.storeId !== scope.storeId ||
    conversation.purpose !== "GENERAL" ||
    conversation.status !== "ACTIVE"
  )
    unavailable()
  const message = await tx.assistantMessage.findFirst({
    where: {
      id: input.messageId,
      conversationId: input.conversationId,
      role: "user",
      conversation: conversationWhere,
    },
    select: { id: true, conversationId: true, role: true, parts: true },
  })
  if (
    !message ||
    message.id !== input.messageId ||
    message.conversationId !== input.conversationId ||
    message.role !== "user" ||
    !Array.isArray(message.parts)
  )
    unavailable()
  const part = record(message.parts[input.source.partIndex])
  if (!part) unavailable()
  const origin: Origin = {
    actorUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    conversationId: input.conversationId,
  }
  if (input.source.kind === "message") {
    if (part.type !== "text" || typeof part.text !== "string") unavailable()
    return {
      origin,
      messageId: message.id,
      kind: "message",
      partIndex: input.source.partIndex,
      text: part.text,
      textDigest: createHash("sha256").update(part.text).digest("hex"),
    }
  }
  const data = record(part.data)
  if (
    part.type !== "data-setup-attachment" ||
    !data ||
    data.attachmentId !== input.source.attachmentId ||
    data.expired === true
  )
    unavailable()
  const now = new Date(Date.now())
  const attachment = await tx.assistantAttachment.findFirst({
    where: {
      id: input.source.attachmentId,
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      status: "READY",
      retentionUntil: { gt: now },
      kind: { in: ["AUDIO", "PDF", "IMAGE"] },
      conversation: conversationWhere,
    },
    select: {
      id: true,
      actorUserId: true,
      tenantId: true,
      storeId: true,
      conversationId: true,
      messageId: true,
      status: true,
      kind: true,
      processingAttempts: true,
      contentDigest: true,
      transcript: true,
      extraction: true,
      retentionUntil: true,
    },
  })
  if (
    !attachment ||
    attachment.id !== input.source.attachmentId ||
    attachment.actorUserId !== scope.userId ||
    attachment.tenantId !== scope.tenantId ||
    attachment.storeId !== scope.storeId ||
    attachment.conversationId !== input.conversationId ||
    attachment.messageId !== input.messageId ||
    attachment.status !== "READY" ||
    !["AUDIO", "PDF", "IMAGE"].includes(attachment.kind) ||
    data.kind !== attachment.kind ||
    !Number.isSafeInteger(attachment.processingAttempts) ||
    attachment.processingAttempts < 1 ||
    !/^[a-f0-9]{64}$/.test(attachment.contentDigest) ||
    !(attachment.retentionUntil instanceof Date) ||
    !Number.isFinite(attachment.retentionUntil.getTime()) ||
    attachment.retentionUntil <= now
  )
    unavailable()
  let extraction: Pages | Transcript | null = null
  if (attachment.kind === "PDF") {
    const parsed = pagesSchema.safeParse(attachment.extraction)
    if (!parsed.success) unavailable()
    extraction = parsed.data
  } else if (attachment.kind === "AUDIO") {
    const parsed = setupTranscriptExtractionSchema
      .strict()
      .safeParse(attachment.extraction)
    if (!parsed.success) unavailable()
    extraction = parsed.data
  }
  if (attachment.kind !== "AUDIO" && attachment.transcript !== null)
    unavailable()
  // contentDigest is the persisted admitted-byte SHA-256, verified by the upload
  // boundary. This read does not fetch/re-hash bytes or expose their storage URL.
  // Bind the FULL saved extraction even for IMAGE; expose no image semantics.
  return {
    origin,
    messageId: message.id,
    kind: "attachment",
    attachmentId: attachment.id,
    attachmentKind:
      attachment.kind === "PDF"
        ? "PDF"
        : attachment.kind === "AUDIO"
          ? "AUDIO"
          : "IMAGE",
    status: "READY",
    processingGeneration: attachment.processingAttempts,
    contentDigest: attachment.contentDigest,
    extractionDigest: extractionDigest(
      attachment.transcript,
      attachment.extraction,
    ),
    retentionUntil: attachment.retentionUntil.toISOString(),
    transcript: attachment.transcript,
    extraction,
  }
}
