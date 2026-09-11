import { CustomerConversationListScreen } from "@/components/mobile/customer-conversations/customer-conversation-list-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { isCustomerConversationListQaState } from "@/lib/customer-conversation-list-qa"
import { getCustomerConversationSession } from "@/lib/customer-conversation-store"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function CustomerConversationsRoute() {
  const { accessProfile, isAuthenticated } = useAuthContext()
  const { qaState } = useLocalSearchParams<{ qaState?: string | string[] }>()
  const allowNoAccessQa = isCustomerConversationListQaState({
    development: __DEV__,
    qaState,
  })

  const hasGuestCapability = Boolean(getCustomerConversationSession())
  const hasLinkedCustomerHistory = Boolean(
    isAuthenticated && accessProfile?.hasCustomerHistory,
  )

  if (!allowNoAccessQa && !hasGuestCapability && !hasLinkedCustomerHistory) {
    return (
      <Redirect href={isAuthenticated ? "/" : "/login"} />
    )
  }

  return <CustomerConversationListScreen />
}
