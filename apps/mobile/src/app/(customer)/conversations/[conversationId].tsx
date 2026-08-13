import { CustomerConversationDetailScreen } from "@/components/mobile/customer-conversations/customer-conversation-detail-screen"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { useLocalSearchParams } from "expo-router"

export default function CustomerConversationRoute() {
  const params = useLocalSearchParams<{
    conversationId?: string | string[]
    publicToken?: string | string[]
  }>()

  return (
    <CustomerConversationDetailScreen
      conversationId={oneRouteParam(params.conversationId)}
      publicToken={oneRouteParam(params.publicToken)}
    />
  )
}
