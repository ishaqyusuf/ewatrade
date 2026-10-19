import { createHash } from "node:crypto"
import {
  WHATSAPP_NOTICE_VERSION,
  type WhatsAppNoticeCode,
  renderWhatsAppNotice,
} from "@ewatrade/assistant/channels/notice"
import type { PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"
import { cancelAssistantWhatsAppPendingMediaInTransaction } from "./media-source-lifecycle"
import {
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
} from "./processing"

/** A fixed transport notice has no model run, draft, receipt or execution authority. */
export function settleAssistantWhatsAppNotice(
  db: PrismaClient,
  input: {
    principal: WhatsAppConversationPrincipal
    lease: WhatsAppInboxLease
    code: WhatsAppNoticeCode
  },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE id=(SELECT "identityId" FROM "AssistantWhatsAppBinding" WHERE id=${input.principal.bindingId}) FOR UPDATE`
    const inbox = await assertAssistantWhatsAppInboxLease(tx, input.lease, now)
    if (
      inbox.kind !== "TURN" ||
      inbox.bindingId !== input.principal.bindingId ||
      inbox.identityId
    )
      throw new AssistantWhatsAppError("UNAUTHORIZED")
    const resolved = await resolveAssistantWhatsAppConversation(
      tx,
      input.principal,
      now,
    )
    const store = resolved.tenantContext.activeStore
    if (!store) throw new AssistantWhatsAppError("UNAUTHORIZED")
    const authorityDigest = await assistantWhatsAppAuthorityDigest(tx, resolved)
    const content = renderWhatsAppNotice(
      input.code,
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
    await tx.assistantWhatsAppOutbox.create({
      data: {
        inboxId: inbox.id,
        phoneNumberId: inbox.phoneNumberId,
        responseRevision: 1,
        chunkIndex: 0,
        chunkCount: 1,
        rendererVersion: WHATSAPP_NOTICE_VERSION,
        renderKind: "notice",
        authorityDigest,
        content,
        contentDigest: createHash("sha256").update(content).digest("hex"),
        expiresAt: inbox.expiresAt,
      },
    })
    await cancelAssistantWhatsAppPendingMediaInTransaction(tx, [inbox.id], now)
    await tx.assistantWhatsAppInbox.update({
      where: { id: inbox.id },
      data: {
        state: "COMPLETED",
        content: { type: "channel_notice", code: input.code },
        executionAuthorityDigest: authorityDigest,
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    })
    return { state: "COMPLETED" as const }
  })
}
/** Attachment processing has its own bounded retry ledger; polling it is not a failed model attempt. */
export function deferAssistantWhatsAppMediaInbox(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  return db.assistantWhatsAppInbox.updateMany({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      kind: "TURN",
      identityId: null,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
      attempts: { gt: 0 },
      content: { path: ["type"], equals: "media" },
    },
    data: {
      state: "PENDING",
      attempts: { decrement: 1 },
      nextAttemptAt: new Date(now.getTime() + 30_000),
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: "MEDIA_PROCESSING",
    },
  })
}
