import { resolveBusinessHomeMarketLedgerQaPath } from "@/lib/business-home-market-ledger-qa"
import { resolveSalesRepShiftLedgerQaPath } from "@/lib/sales-rep-shift-ledger-qa"
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

  const salesRepShiftLedgerQaPath = resolveSalesRepShiftLedgerQaPath(
    path,
    __DEV__,
  )
  if (salesRepShiftLedgerQaPath) return salesRepShiftLedgerQaPath

  const resolved = resolveCustomerDeepLink(path)
  if (resolved.pendingTransfer) {
    await initializeCustomerConversationStore()
    setPendingCustomerTransfer(resolved.pendingTransfer)
  }
  return resolved.path
}
