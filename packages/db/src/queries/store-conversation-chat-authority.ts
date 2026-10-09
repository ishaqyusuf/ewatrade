import {
  STORE_CONVERSATION_CHAT_SCOPE_MESSAGE,
  canUseStoreConversationFreeFormChat,
} from "@ewatrade/service-commerce"
import type { Prisma } from "../../generated/prisma/client"
import { StoreConversationError } from "./store-conversations-core"

export function rejectGuestStoreConversationFreeFormChat(): never {
  throw new StoreConversationError(
    "NOT_READY",
    STORE_CONVERSATION_CHAT_SCOPE_MESSAGE,
  )
}

export async function assertAccountStoreConversationChatAuthority(
  db: Pick<Prisma.TransactionClient, "user">,
  userId: string,
) {
  const user = await db.user.findUnique({
    select: { ageBand: true },
    where: { id: userId },
  })
  if (
    !canUseStoreConversationFreeFormChat({
      ageBand: user?.ageBand,
      principal: "account",
    })
  )
    throw new StoreConversationError(
      "NOT_READY",
      STORE_CONVERSATION_CHAT_SCOPE_MESSAGE,
    )
}

/** Staff may send free-form replies only into an active adult account conversation. */
export async function assertStoreConversationChatRecipient(
  db: Pick<Prisma.TransactionClient, "storeConversationAccountAccess" | "user">,
  scope: { conversationId: string; storeId: string; tenantId: string },
) {
  const access = await db.storeConversationAccountAccess.findFirst({
    select: { accountUserId: true },
    where: {
      conversationId: scope.conversationId,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
      status: "ACTIVE",
      revokedAt: null,
    },
  })
  if (!access) rejectGuestStoreConversationFreeFormChat()
  await assertAccountStoreConversationChatAuthority(db, access.accountUserId)
}
