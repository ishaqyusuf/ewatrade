import { CustomerConversationAge } from "@/components/mobile/customer-conversations/customer-conversation-age"
import { CustomerConversationDetailScreen } from "@/components/mobile/customer-conversations/customer-conversation-detail-screen"
import { parseCustomerConversationDetailQaState } from "@/lib/customer-conversation-detail-qa"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { View } from "react-native"

export default function CustomerConversationRoute() {
  const [ageAllowed, setAgeAllowed] = useState(false)
  const params = useLocalSearchParams<{
    access?: string | string[]
    conversationId?: string | string[]
    publicToken?: string | string[]
    qaState?: string | string[]
  }>()
  const access = oneRouteParam(params.access)
  const qaState = parseCustomerConversationDetailQaState({
    development: __DEV__,
    qaState: params.qaState,
  })

  return (
    <View className="flex-1 bg-background">
      {!qaState ? (
        <CustomerConversationAge
          accountAccess={access === "account"}
          onAllowedChange={setAgeAllowed}
          requireSafetyAcknowledgement={false}
        />
      ) : null}
      {ageAllowed || qaState ? (
        <CustomerConversationDetailScreen
          accountAccess={access === "account"}
          conversationId={oneRouteParam(params.conversationId)}
          publicToken={oneRouteParam(params.publicToken)}
          qaState={params.qaState}
        />
      ) : null}
    </View>
  )
}
