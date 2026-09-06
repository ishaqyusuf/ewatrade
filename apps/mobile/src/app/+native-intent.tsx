import { resolveBusinessHomeMarketLedgerQaPath } from "@/lib/business-home-market-ledger-qa"
import {
  initializeCustomerConversationStore,
  setPendingCustomerTransfer,
} from "@/lib/customer-conversation-store"
import { resolveCustomerDeepLink } from "@/lib/customer-deep-link"

export async function redirectSystemPath({
  path,
}: {
  initial: boolean
  path: string
}) {
  const businessHomeMarketLedgerQaPath = resolveBusinessHomeMarketLedgerQaPath(
    path,
    __DEV__,
  )
  if (businessHomeMarketLedgerQaPath) return businessHomeMarketLedgerQaPath

  const resolved = resolveCustomerDeepLink(path)
  if (resolved.pendingTransfer) {
    await initializeCustomerConversationStore()
    setPendingCustomerTransfer(resolved.pendingTransfer)
  }
  return resolved.path
}
