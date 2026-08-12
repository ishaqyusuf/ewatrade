import { randomBytes } from "node:crypto"

import {
  type StoreConversationTimelineProjection,
  projectStoreConversationCursor,
  storeConversationSendTextInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  StoreConversationGuestCredentialPurpose,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { createChannelCommerceInquiryInTransaction } from "./commerce-inquiries"
import {
  GUEST_CREDENTIAL_LIFETIME_MS,
  StoreConversationError,
  digestStoreConversationValue,
  loadStoreConversationForGuest,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
  touchStoreConversationGuestCredential,
} from "./store-conversations-core"

function createGuestCredential() {
  return randomBytes(32).toString("base64url")
}

export async function bootstrapWebStoreConversation(
  db: PrismaClient,
  input: { credentialToken?: string | null; publicToken: string },
) {
  const now = new Date()
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    if (
      !entry.actions.includes("request_online") ||
      !entry.requestKinds.includes("product_inquiry")
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This Store is not accepting web conversations right now.",
      )
    }

    let rawCredential: string | null = null
    let credential: Awaited<
      ReturnType<typeof resolveStoreConversationGuestCredential>
    >
    if (input.credentialToken) {
      credential = await resolveStoreConversationGuestCredential(tx, {
        credentialToken: input.credentialToken,
        now,
      })
    } else {
      rawCredential = createGuestCredential()
      const guest = await tx.storeConversationGuestIdentity.create({ data: {} })
      credential = await tx.storeConversationGuestCredential.create({
        data: {
          expiresAt: new Date(now.getTime() + GUEST_CREDENTIAL_LIFETIME_MS),
          guestIdentityId: guest.id,
          purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
          tokenDigest: digestStoreConversationValue(rawCredential),
        },
        include: { guestIdentity: { select: { id: true, status: true } } },
      })
    }

    const existing = await tx.storeConversation.findFirst({
      where: {
        guestIdentityId: credential.guestIdentityId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const conversation = await tx.storeConversation.upsert({
      create: {
        guestIdentityId: credential.guestIdentityId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
      update: {},
      where: {
        storeId_guestIdentityId: {
          guestIdentityId: credential.guestIdentityId,
          storeId: entry.storeId,
        },
      },
    })
    if (!existing) {
      const priorAudit = await tx.storeConversationAuditEvent.findFirst({
        select: { id: true },
        where: {
          conversationId: conversation.id,
          type: StoreConversationAuditEventType.BOOTSTRAPPED,
        },
      })
      if (!priorAudit) {
        await tx.storeConversationAuditEvent.create({
          data: {
            actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
            conversationId: conversation.id,
            reasonCode: "guest_web_bootstrap",
            storeId: entry.storeId,
            tenantId: entry.tenantId,
            type: StoreConversationAuditEventType.BOOTSTRAPPED,
          },
        })
      }
    }
    const credentialExpiresAt = await touchStoreConversationGuestCredential(
      tx,
      {
        credentialId: credential.id,
        guestIdentityId: credential.guestIdentityId,
        now,
      },
    )

    return {
      conversation: {
        id: conversation.id,
        state:
          conversation.moderationState ===
          StoreConversationModerationState.RESTRICTED
            ? ("restricted" as const)
            : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
              ? ("archived" as const)
              : ("active" as const),
        storeName: entry.storeName,
      },
      credentialExpiresAt,
      credentialToken: rawCredential,
    }
  })
}

export async function sendGuestStoreConversationText(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    publicToken: string
    text: string
  },
) {
  const parsed = storeConversationSendTextInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    publicToken: input.publicToken,
    text: input.text,
  })
  const now = new Date()
  const commandHash = storeConversationPayloadHash({
    conversationId: parsed.conversationId,
    publicToken: parsed.publicToken,
    text: parsed.text,
  })
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    if (
      !entry.actions.includes("request_online") ||
      !entry.requestKinds.includes("product_inquiry")
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This Store is not accepting web conversations right now.",
      )
    }
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      now,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const lockedConversation = await tx.storeConversation.findFirst({
      where: {
        guestIdentityId: conversation.guestIdentityId,
        id: conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!lockedConversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      include: {
        message: {
          include: {
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
      },
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (receipt.payloadHash !== commandHash || !receipt.message) {
        throw new StoreConversationError(
          "CONFLICT",
          "This message command was already used with different input.",
        )
      }
      return {
        message: projectStoreConversationMessage(receipt.message),
        replayed: true,
        source: receipt.sourceId
          ? { id: receipt.sourceId, kind: "commerce_inquiry" as const }
          : null,
      }
    }
    if (
      lockedConversation.moderationState ===
      StoreConversationModerationState.RESTRICTED
    ) {
      throw new StoreConversationError(
        "FORBIDDEN",
        "This conversation cannot accept new messages right now.",
      )
    }

    const currentSource = await tx.storeConversationRequestLink.findFirst({
      orderBy: { createdAt: "asc" },
      select: { kind: true, sourceId: true, sourceRevision: true },
      where: {
        conversationId: conversation.id,
        kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const source = currentSource
      ? { id: currentSource.sourceId }
      : await createChannelCommerceInquiryInTransaction(tx, {
          actorUserId: "public_store_conversation",
          channelOrigin: "web",
          clientInquiryId: `store-conversation:${conversation.id}:initial`,
          customerName: "Guest customer",
          demand: { kind: "commerce_inquiry", reason: "needs_quote" },
          intakeContext: {
            entryPointId: entry.entryPointId,
            entryPointRevision: entry.entryPointRevision,
            kind: "entry_point",
          },
          lines: [{ description: parsed.text }],
          storeId: entry.storeId,
          summary: parsed.text,
          tenantId: entry.tenantId,
          vertical: "service",
        })
    const sequence = lockedConversation.lastMessageSequence + 1
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        body: parsed.text,
        channel: StoreConversationMessageChannel.WEB,
        conversationId: conversation.id,
        kind: StoreConversationMessageKind.CUSTOMER_TEXT,
        occurredAt: now,
        sequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await tx.storeConversationRequestLink.create({
      data: {
        conversationId: conversation.id,
        kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        messageId: message.id,
        sourceId: source.id,
        sourceRevision: currentSource?.sourceRevision ?? 1,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.CUSTOMER_TEXT,
        messageId: message.id,
        payloadHash: commandHash,
        sourceId: source.id,
        sourceKind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await Promise.all([
      tx.storeConversation.update({
        data: {
          archivedAt: null,
          lastActivityAt: now,
          lastMessageSequence: sequence,
          lifecycle: StoreConversationLifecycle.ACTIVE,
        },
        where: { id: conversation.id },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
          conversationId: conversation.id,
          conversationSequence: sequence,
          reasonCode: "customer_text_accepted",
          storeId: entry.storeId,
          tenantId: entry.tenantId,
          type: StoreConversationAuditEventType.CUSTOMER_MESSAGE_APPENDED,
        },
      }),
    ])

    return {
      message: projectStoreConversationMessage({
        ...message,
        requestLinks: [
          {
            kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
            sourceId: source.id,
          },
        ],
      }),
      replayed: false,
      source: { id: source.id, kind: "commerce_inquiry" as const },
    }
  })
}

export async function getGuestStoreConversationTimeline(
  db: PrismaClient,
  input: {
    beforeSequence?: number
    conversationId: string
    credentialToken: string
    limit?: number
  },
): Promise<StoreConversationTimelineProjection> {
  const parsed = storeConversationTimelineInputSchema.parse({
    beforeSequence: input.beforeSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  const now = new Date()
  return db.$transaction(async (tx) => {
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      now,
    })
    const rows = await tx.storeConversationMessage.findMany({
      include: {
        requestLinks: { select: { kind: true, sourceId: true } },
      },
      orderBy: { sequence: "desc" },
      take: parsed.limit + 1,
      where: {
        conversationId: conversation.id,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
        ...(parsed.beforeSequence
          ? { sequence: { lt: parsed.beforeSequence } }
          : {}),
      },
    })
    const hasMore = rows.length > parsed.limit
    const selected = rows.slice(0, parsed.limit)
    const nextCursor = projectStoreConversationCursor({
      hasMore,
      messages: selected,
    })
    return {
      conversation: {
        id: conversation.id,
        state:
          conversation.moderationState ===
          StoreConversationModerationState.RESTRICTED
            ? "restricted"
            : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
              ? "archived"
              : "active",
        storeName: conversation.store.name,
      },
      messages: selected.reverse().map(projectStoreConversationMessage),
      nextCursor,
    }
  })
}
