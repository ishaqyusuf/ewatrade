import { createHash } from "node:crypto"
import {
  WHATSAPP_INGRESS_CLOCK_SKEW_MS,
  WHATSAPP_INGRESS_RETENTION_MS,
} from "@ewatrade/assistant/channels/ingress"
import {
  WHATSAPP_NOTICE_VERSION,
  renderWhatsAppNotice,
} from "@ewatrade/assistant/channels/notice"
import {
  assistantWhatsAppConfigurationValid,
  assistantWhatsAppUserAllowed,
  isAssistantWhatsAppPilotTenant,
} from "@ewatrade/assistant/channels/policy"
import type { Prisma } from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"

const code = "TRANSPORT_RATE_LIMITED" as const
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const noticeLifetimeMs = 5 * 60_000

/** Server identity only. Provider IDs and denied message content never select this daily row. */
export function assistantWhatsAppQuotaNoticeId(
  input: { userId: string; phoneNumberId: string },
  now: Date,
) {
  if (
    !input.userId ||
    input.userId.length > 128 ||
    !/^\d{5,32}$/.test(input.phoneNumberId) ||
    !Number.isFinite(now.getTime())
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return `wa-quota-${hash(JSON.stringify(["whatsapp-quota-notice-v1", input.userId, input.phoneNumberId, now.toISOString().slice(0, 10)]))}`
}

/** Caller holds the existing quota-denial transaction. This stages at most one bound notice per actor/endpoint/day. */
export async function stageAssistantWhatsAppQuotaNoticeInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    principal: WhatsAppConversationPrincipal
    providerMessageId: string
    providerOccurredAt: Date
  },
  now = new Date(),
) {
  if (
    process.env.ASSISTANT_WHATSAPP_ENABLED !== "true" ||
    !assistantWhatsAppConfigurationValid()
  )
    return undefined
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(input.providerOccurredAt.getTime()) ||
    !input.providerMessageId ||
    input.providerMessageId.length > 256 ||
    input.providerOccurredAt.getTime() >
      now.getTime() + WHATSAPP_INGRESS_CLOCK_SKEW_MS ||
    input.providerOccurredAt.getTime() + WHATSAPP_INGRESS_RETENTION_MS <=
      now.getTime()
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (
    input.principal.phoneNumberId !==
    process.env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim()
  )
    return undefined
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${input.principal.phoneNumberId} AND "senderId"=${input.principal.senderId} FOR UPDATE`
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  if (
    !assistantWhatsAppUserAllowed(
      resolved.scope.userId,
      (process.env.ASSISTANT_WHATSAPP_PILOT_USER_IDS ?? "")
        .split(",")
        .map((id) => id.trim()),
    ) ||
    !isAssistantWhatsAppPilotTenant(resolved.scope.tenantId)
  )
    return undefined
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-whatsapp-user:${resolved.scope.userId}`},0))`
  const id = assistantWhatsAppQuotaNoticeId(
    {
      userId: resolved.scope.userId,
      phoneNumberId: input.principal.phoneNumberId,
    },
    now,
  )
  if (
    await tx.assistantWhatsAppInbox.findUnique({
      where: { id },
      select: { id: true },
    })
  )
    return undefined
  const store = resolved.tenantContext.activeStore
  if (!store) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const authorityDigest = await assistantWhatsAppAuthorityDigest(tx, resolved)
  const content = { type: "channel_notice" as const, code }
  const body = renderWhatsAppNotice(
    code,
    {
      businessName: resolved.tenantContext.tenant.name,
      storeName: store.name,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      conversationId: resolved.conversation.id,
      purpose: resolved.conversation.purpose,
    },
    process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
  )
  const expiresAt = new Date(
    Math.min(
      now.getTime() + noticeLifetimeMs,
      input.providerOccurredAt.getTime() + WHATSAPP_INGRESS_RETENTION_MS,
    ),
  )
  const { inboundSequence } = await tx.assistantWhatsAppBinding.update({
    where: { id: resolved.binding.id },
    data: { inboundSequence: { increment: 1 } },
    select: { inboundSequence: true },
  })
  const created = await tx.assistantWhatsAppInbox.createMany({
    data: [
      {
        id,
        kind: "TURN",
        bindingId: resolved.binding.id,
        phoneNumberId: input.principal.phoneNumberId,
        providerMessageId: input.providerMessageId,
        contentDigest: hash(JSON.stringify(content)),
        content,
        sequence: inboundSequence,
        requestId: `${id}-notice`,
        userMessageId: `${id}-message`,
        providerOccurredAt: input.providerOccurredAt,
        receivedAt: now,
        expiresAt,
        state: "COMPLETED",
        completedAt: now,
        errorCode: "INGRESS_RATE_LIMITED",
        executionAuthorityDigest: authorityDigest,
      },
    ],
    skipDuplicates: true,
  })
  if (created.count !== 1) return undefined
  const outbox = await tx.assistantWhatsAppOutbox.create({
    data: {
      inboxId: id,
      phoneNumberId: input.principal.phoneNumberId,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_NOTICE_VERSION,
      renderKind: "notice",
      authorityDigest,
      content: body,
      contentDigest: hash(body),
      expiresAt,
    },
    select: { id: true },
  })
  return {
    kind: "quota_notice_accepted" as const,
    id,
    bindingId: resolved.binding.id,
    requestId: `${id}-notice`,
    outboxId: outbox.id,
  }
}
