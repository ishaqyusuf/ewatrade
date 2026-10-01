import { CustomerConversationEntryAge } from "@/components/mobile/customer-conversations/customer-conversation-entry-age"
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
    <CustomerConversationEntryAge
      publicToken={publicToken}
      targetCredentialToken={transfer?.targetCredentialToken ?? null}
      transferToken={transfer?.transferToken ?? null}
    />
  )
}
