import type { StoreConversationQuoteSnapshot } from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { appendFirstReleasedQuoteAccountInvitationInTransaction } from "./store-conversation-accounts"
import { scheduleUnreadStoreConversationNotificationInTransaction } from "./store-conversation-notifications/intents"
import {
  StoreConversationError,
  lockStoreConversation,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"
import type { DbClient } from "./types"

const MAX_LINKED_CONVERSATIONS_PER_SOURCE = 100

const quoteSourceType = {
  [StoreConversationRequestKind.COMMERCE_INQUIRY]:
    CommerceQuoteSourceType.COMMERCE_INQUIRY,
  [StoreConversationRequestKind.PRESCRIPTION_REQUEST]:
    CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
  [StoreConversationRequestKind.SERVICE_REQUEST]:
    CommerceQuoteSourceType.SERVICE_REQUEST,
} satisfies Record<StoreConversationRequestKind, CommerceQuoteSourceType>

export type ReleasedQuoteActionMessageReceipt = {
  conversationId: string
  messageId: string
  payloadHash: string
  replayed: boolean
}

function quoteSnapshot(input: {
  currencyCode: string
  options: StoreConversationQuoteSnapshot["options"]
  version: number
}): StoreConversationQuoteSnapshot {
  const options = [...input.options].sort(
    (left, right) => left.position - right.position,
  )
  if (
    options.length < 1 ||
    options.length > 20 ||
    options.some(
      (option) =>
        !option.label.trim() ||
        option.label.length > 120 ||
        !Number.isSafeInteger(option.totalMinor) ||
        option.totalMinor < 0,
    )
  ) {
    throw new StoreConversationError(
      "CONFLICT",
      "This quotation cannot be presented safely in chat.",
    )
  }
  return {
    currencyCode: input.currencyCode,
    mode: options.length === 1 ? "single" : "alternatives",
    options: options.map((option) => ({
      id: option.id,
      label: option.label.trim(),
      position: option.position,
      totalMinor: option.totalMinor,
    })),
    quoteVersion: input.version,
  }
}

function isExactReplay(
  existing: {
    conversationId: string
    messageId: string
    payloadHash: string
    quoteVersionId: string
    sourceId: string
    sourceKind: StoreConversationRequestKind
  },
  expected: {
    conversationId: string
    payloadHash: string
    quoteVersionId: string
    sourceId: string
    sourceKind: StoreConversationRequestKind
  },
) {
  return (
    existing.conversationId === expected.conversationId &&
    existing.payloadHash === expected.payloadHash &&
    existing.quoteVersionId === expected.quoteVersionId &&
    existing.sourceId === expected.sourceId &&
    existing.sourceKind === expected.sourceKind
  )
}

export async function appendReleasedQuoteActionMessagesInTransaction(
  tx: DbClient,
  input: {
    actorUserId: string
    quoteVersionId: string
    source: { id: string; kind: StoreConversationRequestKind }
    storeId: string
    tenantId: string
  },
): Promise<ReleasedQuoteActionMessageReceipt[]> {
  const linked = await tx.storeConversationRequestLink.findMany({
    distinct: ["conversationId"],
    select: { conversationId: true },
    take: MAX_LINKED_CONVERSATIONS_PER_SOURCE + 1,
    where: {
      kind: input.source.kind,
      sourceId: input.source.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (linked.length > MAX_LINKED_CONVERSATIONS_PER_SOURCE) {
    throw new StoreConversationError(
      "CONFLICT",
      "This Request is linked to too many conversations for safe Quote release.",
    )
  }
  const conversationIds = linked
    .map((item) => item.conversationId)
    .sort((left, right) => left.localeCompare(right))
  if (conversationIds.length === 0) return []

  const version = await tx.commerceQuoteVersion.findFirst({
    include: {
      options: {
        orderBy: { position: "asc" },
        select: {
          currencyCode: true,
          id: true,
          label: true,
          position: true,
          totalMinor: true,
        },
      },
      quote: {
        select: {
          currentVersionId: true,
          sourceId: true,
          sourceType: true,
          storeId: true,
          tenantId: true,
        },
      },
    },
    where: {
      id: input.quoteVersionId,
      quote: {
        currentVersionId: input.quoteVersionId,
        sourceId: input.source.id,
        sourceType: quoteSourceType[input.source.kind],
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      status: CommerceQuoteVersionStatus.ISSUED,
    },
  })
  if (
    !version ||
    version.status !== CommerceQuoteVersionStatus.ISSUED ||
    version.quote.currentVersionId !== version.id
  ) {
    throw new StoreConversationError(
      "CONFLICT",
      "Only a released current quotation can be presented in chat.",
    )
  }
  if (
    version.options.some(
      (option) => option.currencyCode !== version.currencyCode,
    )
  ) {
    throw new StoreConversationError(
      "CONFLICT",
      "This quotation has inconsistent display currency.",
    )
  }

  const snapshot = quoteSnapshot({
    currencyCode: version.currencyCode,
    options: version.options,
    version: version.version,
  })
  const payloadHash = storeConversationPayloadHash({
    quoteSnapshot: snapshot,
    quoteVersionId: version.id,
    sourceId: input.source.id,
    sourceKind: input.source.kind,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const sourceRevision = await resolveCurrentStoreConversationRequestRevision(
    tx,
    {
      kind: input.source.kind,
      sourceId: input.source.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  )
  const occurredAt = new Date()
  const receipts: ReleasedQuoteActionMessageReceipt[] = []
  for (const conversationId of conversationIds) {
    await lockStoreConversation(tx, {
      conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    const conversation = await tx.storeConversation.findFirst({
      select: { id: true, lastMessageSequence: true },
      where: {
        id: conversationId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const existing = await tx.storeConversationActionMessage.findUnique({
      select: {
        conversationId: true,
        messageId: true,
        payloadHash: true,
        quoteVersionId: true,
        sourceId: true,
        sourceKind: true,
      },
      where: {
        conversationId_quoteVersionId: {
          conversationId,
          quoteVersionId: version.id,
        },
      },
    })
    if (existing) {
      if (
        !isExactReplay(existing, {
          conversationId,
          payloadHash,
          quoteVersionId: version.id,
          sourceId: input.source.id,
          sourceKind: input.source.kind,
        })
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This quotation presentation conflicts with its original message.",
        )
      }
      await appendFirstReleasedQuoteAccountInvitationInTransaction(tx, {
        conversationId,
        quoteVersionId: version.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      receipts.push({
        conversationId,
        messageId: existing.messageId,
        payloadHash,
        replayed: true,
      })
      continue
    }

    const sequence = conversation.lastMessageSequence + 1
    const advanced = await tx.storeConversation.updateMany({
      data: {
        lastActivityAt: occurredAt,
        lastMessageSequence: sequence,
        lastStoreReplyAt: occurredAt,
        lastStoreReplySequence: sequence,
        responseDueAt: null,
      },
      where: {
        id: conversationId,
        lastMessageSequence: conversation.lastMessageSequence,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (advanced.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Store conversation changed before the quotation was presented.",
      )
    }
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.SYSTEM,
        body: "Quotation",
        channel: StoreConversationMessageChannel.SYSTEM,
        conversationId,
        kind: StoreConversationMessageKind.ACTION_MESSAGE,
        occurredAt,
        sequence,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.storeConversationRequestLink.create({
      data: {
        conversationId,
        kind: input.source.kind,
        messageId: message.id,
        sourceId: input.source.id,
        sourceRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.storeConversationActionMessage.create({
      data: {
        conversationId,
        createdByUserId: input.actorUserId,
        messageId: message.id,
        occurredAt,
        payloadHash,
        quoteSnapshot: snapshot,
        quoteVersionId: version.id,
        sourceId: input.source.id,
        sourceKind: input.source.kind,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await appendFirstReleasedQuoteAccountInvitationInTransaction(tx, {
      conversationId,
      quoteVersionId: version.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    await scheduleUnreadStoreConversationNotificationInTransaction(tx, {
      conversationId,
      messageId: message.id,
      messageSequence: sequence,
      now: occurredAt,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    receipts.push({
      conversationId,
      messageId: message.id,
      payloadHash,
      replayed: false,
    })
  }
  return receipts
}

export async function appendReleasedQuoteActionMessages(
  db: PrismaClient,
  input: Parameters<typeof appendReleasedQuoteActionMessagesInTransaction>[1],
) {
  return db.$transaction((tx) =>
    appendReleasedQuoteActionMessagesInTransaction(tx, input),
  )
}
