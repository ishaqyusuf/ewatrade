import { parseCustomerConversationListQaState } from "@/lib/customer-conversation-list-qa"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type CustomerConversationListQaItem =
  RouterOutputs["serviceCommerce"]["mobileStoreConversations"]["items"][number]

function minutesBefore(now: Date, minutes: number) {
  return new Date(now.getTime() - minutes * 60_000)
}

export function resolveCustomerConversationListQaItems(input: {
  development: boolean
  now?: Date
  qaState?: string | string[]
}): CustomerConversationListQaItem[] | null {
  const qaState = parseCustomerConversationListQaState(input)
  if (qaState === "empty") return []
  if (qaState !== "populated") return null

  const now = input.now ?? new Date()
  return [
    {
      conversationId: "qa-conversation-luma",
      lastActivityAt: minutesBefore(now, 18),
      lastMessage: {
        author: "store",
        text: "Your order is ready for pickup.",
      },
      lastMessageSequence: 12,
      publicToken: "qa-luma",
      state: "active",
      storeAvatar: { kind: "initials", label: "LP" },
      storeName: "Luma Pharmacy",
      unreadStoreMessages: 3,
    },
    {
      conversationId: "qa-conversation-northstar",
      lastActivityAt: minutesBefore(now, 1_560),
      lastMessage: {
        author: "customer",
        text: "Please send the final measurements.",
      },
      lastMessageSequence: 8,
      publicToken: "qa-northstar",
      state: "active",
      storeAvatar: { kind: "initials", label: "NT" },
      storeName: "Northstar Tailoring",
      unreadStoreMessages: 0,
    },
    {
      conversationId: "qa-conversation-adebayo",
      lastActivityAt: minutesBefore(now, 4_500),
      lastMessage: { author: "system", text: "Quote accepted" },
      lastMessageSequence: 5,
      publicToken: "qa-adebayo",
      state: "archived",
      storeAvatar: { kind: "initials", label: "AE" },
      storeName: "Adebayo Electronics",
      unreadStoreMessages: 0,
    },
    {
      conversationId: "qa-conversation-green-basket",
      lastActivityAt: minutesBefore(now, 16_020),
      lastMessage: null,
      lastMessageSequence: 0,
      publicToken: "qa-green-basket",
      state: "restricted",
      storeAvatar: { kind: "initials", label: "GB" },
      storeName: "Green Basket Grocers",
      unreadStoreMessages: 0,
    },
  ]
}
