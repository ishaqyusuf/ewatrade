import { CustomerConversationDetailScreen } from "@/components/mobile/customer-conversations/customer-conversation-detail-screen"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { getOrCreatePendingCustomerTransfer } from "@/lib/customer-conversation-store"
import {
  getPendingCustomerTransferRevision,
  subscribePendingCustomerTransfer,
} from "@/lib/customer-conversation-transfer-signal"
import { useLocalSearchParams } from "expo-router"
import { useSyncExternalStore } from "react"

export default function CustomerStoreEntryRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>()
  const publicToken = oneRouteParam(token)
  useSyncExternalStore(
    subscribePendingCustomerTransfer,
    getPendingCustomerTransferRevision,
    getPendingCustomerTransferRevision,
  )
  const transfer = publicToken
    ? getOrCreatePendingCustomerTransfer(publicToken)
    : null

  return (
    <CustomerConversationDetailScreen
      bootstrap
      publicToken={publicToken}
      targetCredentialToken={transfer?.targetCredentialToken ?? null}
      transferToken={transfer?.transferToken ?? null}
    />
  )
}
