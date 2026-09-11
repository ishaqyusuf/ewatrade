import {
  projectStoreConversationModeration,
  storeConversationMessagesAfterInputSchema,
  storeConversationReadAcknowledgementInputSchema,
} from "@ewatrade/service-commerce"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationCommandKind,
  StoreConversationGuestCredentialPurpose,
} from "../../generated/prisma/enums"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  type StoreConversationActionMaterializationDependencies,
  materializeGuestStoreConversationActionMessagesInTransaction,
  projectStoreConversationActionMessageRow,
  storeConversationActionMessageInclude,
} from "./store-conversation-actions"
import { projectStoreConversationMessageAttachments } from "./store-conversation-attachments"
import {
  StoreConversationError,
  assertStoreConversationAttendant,
  loadStoreConversationForGuest,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  storeConversationPayloadHash,
} from "./store-conversations-core"

type GuestConversationRealtimeDevice = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

type CustomerConversationRealtimePrincipal =
  | { accountUserId: string; kind: "account" }
  | {
      credentialToken: string
      device: GuestConversationRealtimeDevice
      kind: "guest"
    }

export async function acknowledgeStoreConversationStaffRead(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    readThroughSequence: number
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationReadAcknowledgementInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    deliveredThroughSequence: input.readThroughSequence,
    readThroughSequence: input.readThroughSequence,
  })
  const now = new Date()
  const payloadHash = storeConversationPayloadHash({
    actorUserId: input.actorUserId,
    conversationId: parsed.conversationId,
    readThroughSequence: parsed.readThroughSequence,
  })
  return db.$transaction(async (tx) => {
    const membership = await assertStoreConversationAttendant(tx, input)
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      where: {
        id: parsed.conversationId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (
        receipt.kind !== StoreConversationCommandKind.STAFF_READ_ACKNOWLEDGED ||
        receipt.payloadHash !== payloadHash
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This read acknowledgement was already used with different input.",
        )
      }
      const watermark = await tx.storeConversationStaffWatermark.findUnique({
        where: {
          conversationId_membershipId: {
            conversationId: conversation.id,
            membershipId: membership.id,
          },
        },
      })
      return {
        readThroughSequence: watermark?.readThroughSequence ?? 0,
        replayed: true,
      }
    }
    if (parsed.readThroughSequence > conversation.lastMessageSequence) {
      throw new StoreConversationError(
        "CONFLICT",
        "Refresh this conversation before acknowledging newer messages.",
      )
    }
    const prior = await tx.storeConversationStaffWatermark.findUnique({
      where: {
        conversationId_membershipId: {
          conversationId: conversation.id,
          membershipId: membership.id,
        },
      },
    })
    const readThroughSequence = Math.max(
      prior?.readThroughSequence ?? 0,
      parsed.readThroughSequence,
    )
    const watermark = await tx.storeConversationStaffWatermark.upsert({
      create: {
        conversationId: conversation.id,
        membershipId: membership.id,
        readAt: readThroughSequence > 0 ? now : null,
        readThroughSequence,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {
        ...(readThroughSequence > (prior?.readThroughSequence ?? 0)
          ? { readAt: now }
          : {}),
        readThroughSequence,
      },
      where: {
        conversationId_membershipId: {
          conversationId: conversation.id,
          membershipId: membership.id,
        },
      },
    })
    await tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.STAFF_READ_ACKNOWLEDGED,
        payloadHash,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return {
      readThroughSequence: watermark.readThroughSequence,
      replayed: false,
    }
  })
}

const WEB_REALTIME_DEVICE: GuestConversationRealtimeDevice = {
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

const realtimeMessageInclude = {
  accountInvitation: { select: { id: true, status: true } },
  actionMessage: {
    include: storeConversationActionMessageInclude,
  },
  attachments: {
    include: {
      prescriptionMedia: {
        select: { mediaType: true, status: true },
      },
      sourceAttachment: {
        include: {
          mediaAsset: {
            select: {
              kind: true,
              lifecycle: true,
              verifiedDurationMs: true,
            },
          },
        },
      },
    },
  },
  requestLinks: { select: { kind: true, sourceId: true } },
  whatsAppObservation: {
    select: {
      provenance: true,
      status: true,
      statusOccurredAt: true,
    },
  },
} as const

type StoreConversationMessageRow = Prisma.StoreConversationMessageGetPayload<{
  include: typeof realtimeMessageInclude
}>

function projectStaffRealtimeMessages(rows: StoreConversationMessageRow[]) {
  return rows.map((message) =>
    projectStoreConversationMessage({
      ...message,
      actionMessage: message.actionMessage
        ? projectStoreConversationActionMessageRow(message.actionMessage)
        : undefined,
      attachments: projectStoreConversationMessageAttachments(message),
    }),
  )
}

async function getStoreConversationMessagesAfterForCustomer(
  db: PrismaClient,
  input: {
    actionMessageIds?: string[]
    afterSequence?: number
    conversationId: string
    limit?: number
    publicToken: string
  },
  principal: CustomerConversationRealtimePrincipal,
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const parsed = storeConversationMessagesAfterInputSchema.parse({
    actionMessageIds: input.actionMessageIds,
    afterSequence: input.afterSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  const now = new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    const customer =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: parsed.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.device.installationToken,
            now,
            purpose: principal.device.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: parsed.conversationId,
            now,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
    const conversation = customer.conversation
    const rows = await tx.storeConversationMessage.findMany({
      include: realtimeMessageInclude,
      orderBy: { sequence: "asc" },
      take: parsed.limit + 1,
      where: {
        conversationId: conversation.id,
        sequence: { gt: parsed.afterSequence },
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      },
    })
    const hasMore = rows.length > parsed.limit
    const selected = rows.slice(0, parsed.limit)
    const mountedActionRows =
      parsed.actionMessageIds.length === 0
        ? []
        : await tx.storeConversationActionMessage.findMany({
            include: storeConversationActionMessageInclude,
            orderBy: { messageId: "asc" },
            where: {
              conversationId: conversation.id,
              messageId: { in: parsed.actionMessageIds },
              storeId: conversation.storeId,
              tenantId: conversation.tenantId,
            },
          })
    const rowsByMessageId = new Map(
      [
        ...mountedActionRows,
        ...selected.flatMap((message) =>
          message.actionMessage ? [message.actionMessage] : [],
        ),
      ].map((row) => [row.messageId, row]),
    )
    const actionMessages =
      await materializeGuestStoreConversationActionMessagesInTransaction(
        tx,
        {
          available: entry.availability.available,
          now,
          rows: [...rowsByMessageId.values()],
        },
        actionDependencies,
      )
    return {
      actionMessageUpdates: mountedActionRows.flatMap((row) => {
        const actionMessage = actionMessages.get(row.messageId)
        return actionMessage
          ? [{ actionMessage, messageId: row.messageId }]
          : []
      }),
      availability: entry.availability,
      channelMode: entry.channelMode,
      moderation: projectStoreConversationModeration(conversation),
      lastMessageSequence: conversation.lastMessageSequence,
      messages: selected.map((message) =>
        projectStoreConversationMessage({
          ...message,
          actionMessage: message.actionMessage
            ? actionMessages.get(message.id)
            : undefined,
          attachments: projectStoreConversationMessageAttachments(message),
        }),
      ),
      nextCursor: hasMore ? (selected.at(-1)?.sequence ?? null) : null,
    }
  })
}

export function getGuestStoreConversationMessagesAfter(
  db: PrismaClient,
  input: {
    actionMessageIds?: string[]
    afterSequence?: number
    conversationId: string
    credentialToken: string
    limit?: number
    publicToken: string
  },
  device: GuestConversationRealtimeDevice = WEB_REALTIME_DEVICE,
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const { credentialToken, ...messageInput } = input
  return getStoreConversationMessagesAfterForCustomer(
    db,
    messageInput,
    { credentialToken, device, kind: "guest" },
    actionDependencies,
  )
}

export function getAccountStoreConversationMessagesAfter(
  db: PrismaClient,
  input: {
    accountUserId: string
    actionMessageIds?: string[]
    afterSequence?: number
    conversationId: string
    limit?: number
    publicToken: string
  },
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const { accountUserId, ...messageInput } = input
  return getStoreConversationMessagesAfterForCustomer(
    db,
    messageInput,
    { accountUserId, kind: "account" },
    actionDependencies,
  )
}

export async function getStoreConversationStaffMessagesAfter(
  db: PrismaClient,
  input: {
    actorUserId: string
    afterSequence?: number
    conversationId: string
    limit?: number
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationMessagesAfterInputSchema.parse({
    afterSequence: input.afterSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  return db.$transaction(async (tx) => {
    await assertStoreConversationAttendant(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      select: { id: true, lastMessageSequence: true },
      where: {
        id: parsed.conversationId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
    }
    const rows = await tx.storeConversationMessage.findMany({
      include: realtimeMessageInclude,
      orderBy: { sequence: "asc" },
      take: parsed.limit + 1,
      where: {
        conversationId: conversation.id,
        sequence: { gt: parsed.afterSequence },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const hasMore = rows.length > parsed.limit
    const selected = rows.slice(0, parsed.limit)
    return {
      actionMessageUpdates: [],
      lastMessageSequence: conversation.lastMessageSequence,
      messages: projectStaffRealtimeMessages(selected),
      nextCursor: hasMore ? (selected.at(-1)?.sequence ?? null) : null,
    }
  })
}

export async function acknowledgeGuestStoreConversationProgress(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    deliveredThroughSequence: number
    publicToken: string
    readThroughSequence: number
  },
  device: GuestConversationRealtimeDevice = WEB_REALTIME_DEVICE,
) {
  const parsed = storeConversationReadAcknowledgementInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    deliveredThroughSequence: input.deliveredThroughSequence,
    readThroughSequence: input.readThroughSequence,
  })
  const now = new Date()
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    const { conversation, credential } = await loadStoreConversationForGuest(
      tx,
      {
        conversationId: parsed.conversationId,
        credentialToken: input.credentialToken,
        installationToken: device.installationToken,
        now,
        purpose: device.purpose,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    )
    const payloadHash = storeConversationPayloadHash({
      conversationId: parsed.conversationId,
      credentialId: credential.id,
      deliveredThroughSequence: parsed.deliveredThroughSequence,
      readThroughSequence: parsed.readThroughSequence,
    })
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: conversation.storeId,
      tenantId: conversation.tenantId,
    })
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (
        receipt.kind !==
          StoreConversationCommandKind.CUSTOMER_PROGRESS_ACKNOWLEDGED ||
        receipt.payloadHash !== payloadHash
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This progress acknowledgement was already used with different input.",
        )
      }
      const watermark = await tx.storeConversationCustomerWatermark.findUnique({
        where: {
          conversationId_credentialId: {
            conversationId: conversation.id,
            credentialId: credential.id,
          },
        },
      })
      return {
        deliveredThroughSequence: watermark?.deliveredThroughSequence ?? 0,
        readThroughSequence: watermark?.readThroughSequence ?? 0,
        replayed: true,
      }
    }
    if (parsed.deliveredThroughSequence > conversation.lastMessageSequence) {
      throw new StoreConversationError(
        "CONFLICT",
        "Refresh this conversation before acknowledging newer messages.",
      )
    }
    const prior = await tx.storeConversationCustomerWatermark.findUnique({
      where: {
        conversationId_credentialId: {
          conversationId: conversation.id,
          credentialId: credential.id,
        },
      },
    })
    const deliveredThroughSequence = Math.max(
      prior?.deliveredThroughSequence ?? 0,
      parsed.deliveredThroughSequence,
    )
    const readThroughSequence = Math.max(
      prior?.readThroughSequence ?? 0,
      parsed.readThroughSequence,
    )
    const watermark = await tx.storeConversationCustomerWatermark.upsert({
      create: {
        conversationId: conversation.id,
        credentialId: credential.id,
        deliveredAt: deliveredThroughSequence > 0 ? now : null,
        deliveredThroughSequence,
        readAt: readThroughSequence > 0 ? now : null,
        readThroughSequence,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      },
      update: {
        ...(deliveredThroughSequence > (prior?.deliveredThroughSequence ?? 0)
          ? { deliveredAt: now }
          : {}),
        deliveredThroughSequence,
        ...(readThroughSequence > (prior?.readThroughSequence ?? 0)
          ? { readAt: now }
          : {}),
        readThroughSequence,
      },
      where: {
        conversationId_credentialId: {
          conversationId: conversation.id,
          credentialId: credential.id,
        },
      },
    })
    await tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.CUSTOMER_PROGRESS_ACKNOWLEDGED,
        payloadHash,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      },
    })
    return {
      deliveredThroughSequence: watermark.deliveredThroughSequence,
      readThroughSequence: watermark.readThroughSequence,
      replayed: false,
    }
  })
}
