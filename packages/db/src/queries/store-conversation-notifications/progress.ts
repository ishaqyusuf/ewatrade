import { storeConversationReadAcknowledgementInputSchema } from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../../generated/prisma/client"
import { StoreConversationNotificationCommandKind } from "../../../generated/prisma/enums"
import { loadStoreConversationForAccount } from "../store-conversation-accounts"
import {
  lockStoreConversation,
  resolveStoreConversationEntry,
} from "../store-conversations-core"
import {
  STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS,
  StoreConversationNotificationError,
  assertNotificationCommandReplay,
  notificationPayloadHash,
  translateNotificationWriteError,
} from "./shared"

export async function acknowledgeStoreConversationAccountProgress(
  db: PrismaClient,
  rawInput: {
    accountUserId: string
    clientOperationId: string
    conversationId: string
    deliveredThroughSequence: number
    publicToken: string
    readThroughSequence: number
  },
) {
  const input = storeConversationReadAcknowledgementInputSchema.parse({
    clientOperationId: rawInput.clientOperationId,
    conversationId: rawInput.conversationId,
    deliveredThroughSequence: rawInput.deliveredThroughSequence,
    readThroughSequence: rawInput.readThroughSequence,
  })
  const now = new Date()
  const principalKey = `account:${rawInput.accountUserId}`
  const payloadHash = notificationPayloadHash({
    conversationId: input.conversationId,
    deliveredThroughSequence: input.deliveredThroughSequence,
    readThroughSequence: input.readThroughSequence,
  })
  try {
    return await db.$transaction(async (tx) => {
      const entry = await resolveStoreConversationEntry(tx, {
        publicToken: rawInput.publicToken,
      })
      const loaded = await loadStoreConversationForAccount(tx, {
        accountUserId: rawInput.accountUserId,
        conversationId: input.conversationId,
        now,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      await lockStoreConversation(tx, {
        conversationId: loaded.conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      const replay = await tx.storeConversationNotificationCommand.findUnique({
        where: {
          principalKey_clientOperationId: {
            clientOperationId: input.clientOperationId,
            principalKey,
          },
        },
      })
      if (replay) {
        assertNotificationCommandReplay({
          actualKind: replay.kind,
          actualPayloadHash: replay.payloadHash,
          expectedKind:
            StoreConversationNotificationCommandKind.ACCOUNT_PROGRESS_ACKNOWLEDGED,
          expectedPayloadHash: payloadHash,
        })
        const watermark = await tx.storeConversationAccountWatermark.findUnique(
          {
            where: {
              conversationId_accountUserId: {
                accountUserId: rawInput.accountUserId,
                conversationId: input.conversationId,
              },
            },
          },
        )
        return {
          deliveredThroughSequence: watermark?.deliveredThroughSequence ?? 0,
          readThroughSequence: watermark?.readThroughSequence ?? 0,
          replayed: true,
        }
      }
      if (
        input.deliveredThroughSequence > loaded.conversation.lastMessageSequence
      ) {
        throw new StoreConversationNotificationError(
          "CONFLICT",
          "Refresh this conversation before acknowledging newer messages.",
        )
      }
      const prior = await tx.storeConversationAccountWatermark.findUnique({
        where: {
          conversationId_accountUserId: {
            accountUserId: rawInput.accountUserId,
            conversationId: input.conversationId,
          },
        },
      })
      const deliveredThroughSequence = Math.max(
        prior?.deliveredThroughSequence ?? 0,
        input.deliveredThroughSequence,
      )
      const readThroughSequence = Math.max(
        prior?.readThroughSequence ?? 0,
        input.readThroughSequence,
      )
      const watermark = await tx.storeConversationAccountWatermark.upsert({
        create: {
          accountUserId: rawInput.accountUserId,
          conversationId: input.conversationId,
          deliveredAt: deliveredThroughSequence > 0 ? now : null,
          deliveredThroughSequence,
          readAt: readThroughSequence > 0 ? now : null,
          readThroughSequence,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
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
          conversationId_accountUserId: {
            accountUserId: rawInput.accountUserId,
            conversationId: input.conversationId,
          },
        },
      })
      await tx.storeConversationNotificationCommand.create({
        data: {
          accountUserId: rawInput.accountUserId,
          clientOperationId: input.clientOperationId,
          conversationId: input.conversationId,
          kind: StoreConversationNotificationCommandKind.ACCOUNT_PROGRESS_ACKNOWLEDGED,
          payloadHash,
          principalKey,
          resultId: watermark.id,
        },
      })
      return {
        deliveredThroughSequence: watermark.deliveredThroughSequence,
        readThroughSequence: watermark.readThroughSequence,
        replayed: false,
      }
    }, STORE_CONVERSATION_NOTIFICATION_TRANSACTION_OPTIONS)
  } catch (error) {
    translateNotificationWriteError(error)
  }
}
