import { Prisma } from "../../generated/prisma/client"
import {
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  type StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import {
  lockStoreConversation,
  projectStoreConversationMessage,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"

type WhatsAppMessageSource = {
  sourceId: string
  sourceKind: StoreConversationRequestKind
  sourceRevision: number
}

type WhatsAppMessageRoute = {
  conversationId: string
  id: string
  revision: number
  storeId: string
  tenantId: string
}

export async function appendStoreConversationWhatsAppCustomerTextInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    auditReasonCode: string
    now: Date
    providerEventDigest: string
    route: WhatsAppMessageRoute
    source: WhatsAppMessageSource
    text: string
  },
) {
  await lockStoreConversation(tx, input.route)
  const clientOperationId = `wa:${input.providerEventDigest}`
  const payloadHash = storeConversationPayloadHash({
    providerEventDigest: input.providerEventDigest,
    routeId: input.route.id,
    routeRevision: input.route.revision,
    source: input.source,
    text: input.text,
  })
  const receipt = await tx.storeConversationCommandReceipt.findUnique({
    include: {
      message: {
        include: {
          requestLinks: { select: { kind: true, sourceId: true } },
        },
      },
    },
    where: {
      conversationId_clientOperationId: {
        clientOperationId,
        conversationId: input.route.conversationId,
      },
    },
  })
  if (receipt) {
    if (receipt.payloadHash !== payloadHash || !receipt.message) {
      throw new Error("WHATSAPP_MESSAGE_IDEMPOTENCY_MISMATCH")
    }
    return {
      message: projectStoreConversationMessage(receipt.message),
      replayed: true,
    }
  }
  const currentRevision = await resolveCurrentStoreConversationRequestRevision(
    tx,
    {
      kind: input.source.sourceKind,
      sourceId: input.source.sourceId,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    },
  )
  if (currentRevision !== input.source.sourceRevision) {
    throw new Error("WHATSAPP_MESSAGE_SOURCE_CHANGED")
  }
  const conversation = await tx.storeConversation.findFirst({
    select: { lastMessageSequence: true },
    where: {
      id: input.route.conversationId,
      lifecycle: StoreConversationLifecycle.ACTIVE,
      moderationState: StoreConversationModerationState.OPEN,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    },
  })
  if (!conversation) throw new Error("WHATSAPP_CONVERSATION_NOT_READY")
  const sequence = conversation.lastMessageSequence + 1
  const updated = await tx.storeConversation.updateMany({
    data: {
      lastActivityAt: input.now,
      lastCustomerMessageAt: input.now,
      lastCustomerMessageSequence: sequence,
      lastMessageSequence: sequence,
    },
    where: {
      id: input.route.conversationId,
      lastMessageSequence: conversation.lastMessageSequence,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    },
  })
  if (updated.count !== 1) throw new Error("WHATSAPP_CONVERSATION_CHANGED")
  const message = await tx.storeConversationMessage.create({
    data: {
      authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
      body: input.text,
      channel: StoreConversationMessageChannel.WHATSAPP,
      conversationId: input.route.conversationId,
      kind: StoreConversationMessageKind.CUSTOMER_TEXT,
      occurredAt: input.now,
      sequence,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    },
  })
  const link = await tx.storeConversationRequestLink.create({
    data: {
      conversationId: input.route.conversationId,
      kind: input.source.sourceKind,
      messageId: message.id,
      sourceId: input.source.sourceId,
      sourceRevision: input.source.sourceRevision,
      storeId: input.route.storeId,
      tenantId: input.route.tenantId,
    },
  })
  await Promise.all([
    tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId,
        conversationId: input.route.conversationId,
        kind: "CUSTOMER_TEXT",
        messageId: message.id,
        payloadHash,
        sourceId: input.source.sourceId,
        sourceKind: input.source.sourceKind,
        storeId: input.route.storeId,
        tenantId: input.route.tenantId,
      },
    }),
    tx.storeConversationAuditEvent.create({
      data: {
        actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        conversationId: input.route.conversationId,
        conversationSequence: sequence,
        reasonCode: input.auditReasonCode,
        storeId: input.route.storeId,
        tenantId: input.route.tenantId,
        type: "CUSTOMER_MESSAGE_APPENDED",
      },
    }),
  ])
  return {
    message: projectStoreConversationMessage({
      ...message,
      requestLinks: [{ kind: link.kind, sourceId: link.sourceId }],
    }),
    replayed: false,
  }
}
