import { CustomerConversationAge } from "@/components/mobile/customer-conversations/customer-conversation-age"
import { CustomerConversationListScreen } from "@/components/mobile/customer-conversations/customer-conversation-list-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { isCustomerConversationListQaState } from "@/lib/customer-conversation-list-qa"
import { getCustomerConversationSession } from "@/lib/customer-conversation-store"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

export default function CustomerConversationsRoute() {
  const [accountAgeAllowed, setAccountAgeAllowed] = useState(false)
  const [guestAgeAllowed, setGuestAgeAllowed] = useState(false)
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
    return <Redirect href={isAuthenticated ? "/" : "/login"} />
  }

  const allowAccount = hasLinkedCustomerHistory && accountAgeAllowed
  const allowGuest = hasGuestCapability && guestAgeAllowed
  return (
    <View className="flex-1 bg-background">
      {!allowNoAccessQa && hasLinkedCustomerHistory ? (
        <CustomerConversationAge
          accountAccess
          onAllowedChange={setAccountAgeAllowed}
          requireSafetyAcknowledgement={false}
        />
      ) : null}
      {!allowNoAccessQa && hasGuestCapability ? (
        <CustomerConversationAge
          accountAccess={false}
          onAllowedChange={setGuestAgeAllowed}
          requireSafetyAcknowledgement={false}
        />
      ) : null}
      {allowNoAccessQa || allowAccount || allowGuest ? (
        <CustomerConversationListScreen
          allowAccount={allowAccount}
          allowGuest={allowGuest}
        />
      ) : null}
    </View>
  )
}
