import { CustomerConversationDetailScreen } from "@/components/mobile/customer-conversations/customer-conversation-detail-screen"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { useLocalSearchParams } from "expo-router"

export default function CustomerConversationRoute() {
  const params = useLocalSearchParams<{
    access?: string | string[]
    conversationId?: string | string[]
    publicToken?: string | string[]
    qaState?: string | string[]
  }>()
  const access = oneRouteParam(params.access)

  return (
    <CustomerConversationDetailScreen
      accountAccess={access === "account"}
      conversationId={oneRouteParam(params.conversationId)}
      publicToken={oneRouteParam(params.publicToken)}
      qaState={params.qaState}
    />
  )
}
