import { CustomerConversationEntryAge } from "@/components/mobile/customer-conversations/customer-conversation-entry-age"
import { oneRouteParam } from "@/lib/customer-conversation-state"
import { getOrCreatePendingCustomerTransfer } from "@/lib/customer-conversation-store"
import {
  getPendingCustomerTransferRevision,
  subscribePendingCustomerTransfer,
} from "@/lib/customer-conversation-transfer-signal"
import { useLocalSearchParams } from "expo-router"
import { useSyncExternalStore } from "react"
import InvalidStoreLink from "../invalid-store-link"

export default function CustomerStoreEntryRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>()
  const publicToken = oneRouteParam(token)
  useSyncExternalStore(
    subscribePendingCustomerTransfer,
    getPendingCustomerTransferRevision,
    getPendingCustomerTransferRevision,
  )
  if (!publicToken || !/^[A-Za-z0-9_-]{32,200}$/.test(publicToken))
    return <InvalidStoreLink />

  const transfer = getOrCreatePendingCustomerTransfer(publicToken)

  return (
    <CustomerConversationEntryAge
      publicToken={publicToken}
      targetCredentialToken={transfer?.targetCredentialToken ?? null}
      transferToken={transfer?.transferToken ?? null}
    />
  )
}
