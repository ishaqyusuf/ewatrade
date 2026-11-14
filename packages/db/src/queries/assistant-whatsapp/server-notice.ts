import { createHash } from "node:crypto"
import type { DbClient } from "../types"

export const WHATSAPP_SERVER_NOTICE_KIND = "server_notice"
export const WHATSAPP_SERVER_NOTICE_VERSION = "whatsapp-server-notice-v1"
/** Kept clear of reply, review and web-review revision lanes on the same inbox. */
const LANE = 1_000_000

/**
 * A later server message (e.g. "Ada approved your receipt") for a user's linked
 * WhatsApp chat in this Store. It rides on their newest completed message that
 * is still inside WhatsApp's 24-hour window; with none, nothing is staged and
 * the caller relies on the app. Delivery rechecks the binding's current authority.
 */
export async function stageAssistantWhatsAppServerNotice(
  db: DbClient,
  input: {
    userId: string
    tenantId: string
    storeId: string
    /** Carries the record's own facts, so a retry finds and reuses the same row. */
    text: string
  },
  now = new Date(),
): Promise<{ outboxId: string; staged: boolean } | null> {
  const text = input.text.trim().slice(0, 4096)
  if (!text) return null
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: {
      kind: "TURN",
      state: "COMPLETED",
      expiresAt: { gt: now },
      executionAuthorityDigest: { not: null },
      binding: {
        identity: { userId: input.userId, revokedAt: null },
        grant: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          revokedAt: null,
        },
      },
    },
    orderBy: { sequence: "desc" },
    select: {
      id: true,
      phoneNumberId: true,
      expiresAt: true,
      executionAuthorityDigest: true,
      bindingId: true,
      binding: { select: { identity: { select: { activeBindingId: true } } } },
    },
  })
  if (
    !inbox?.executionAuthorityDigest ||
    !inbox.bindingId ||
    inbox.binding?.identity.activeBindingId !== inbox.bindingId
  )
    return null
  const content = text
  // Delivery checks the body against this digest.
  const contentDigest = createHash("sha256").update(content).digest("hex")
  const existing = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      renderKind: WHATSAPP_SERVER_NOTICE_KIND,
      contentDigest,
      inbox: { bindingId: inbox.bindingId },
    },
    select: { id: true },
  })
  if (existing) return { outboxId: existing.id, staged: false }
  const last = await db.assistantWhatsAppOutbox.findFirst({
    where: { inboxId: inbox.id, responseRevision: { gte: LANE } },
    orderBy: { responseRevision: "desc" },
    select: { responseRevision: true },
  })
  const row = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      responseRevision: (last?.responseRevision ?? LANE - 1) + 1,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_SERVER_NOTICE_VERSION,
      renderKind: WHATSAPP_SERVER_NOTICE_KIND,
      authorityDigest: inbox.executionAuthorityDigest,
      content,
      contentDigest,
      expiresAt: inbox.expiresAt,
    },
    select: { id: true },
  })
  return { outboxId: row.id, staged: true }
}
