import { CustomerConversationDetailScreen } from "@/components/mobile/customer-conversations/customer-conversation-detail-screen"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { getOrCreatePendingCustomerTransfer } from "@/lib/customer-conversation-store"
import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

export default function CustomerStoreEntryRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>()
  const publicToken = oneRouteParam(token)
  const transfer = useMemo(
    () =>
      publicToken ? getOrCreatePendingCustomerTransfer(publicToken) : null,
    [publicToken],
  )

  return (
    <CustomerConversationDetailScreen
      bootstrap
      publicToken={publicToken}
      targetCredentialToken={transfer?.targetCredentialToken ?? null}
      transferToken={transfer?.transferToken ?? null}
    />
  )
}
