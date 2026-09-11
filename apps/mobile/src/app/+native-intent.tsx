import { resolveBusinessHomeMarketLedgerQaPath } from "@/lib/business-home-market-ledger-qa"
import { resolveBusinessLargeTextQaPath } from "@/lib/business-large-text-qa"
import {
  initializeCustomerConversationStore,
  setPendingCustomerTransfer,
} from "@/lib/customer-conversation-store"
import {
  resolveCustomerConversationQaPath,
  resolveCustomerDeepLink,
} from "@/lib/customer-deep-link"
import { resolveOnboardingMarketDayQaPath } from "@/lib/onboarding-market-day-qa"
import { resolveOrderDetailCurrentQaPath } from "@/lib/order-detail-current-qa"
import { resolveOrdersDispatchLedgerQaPath } from "@/lib/orders-dispatch-ledger-qa"
import { resolveSalesRepShiftLedgerQaPath } from "@/lib/sales-rep-shift-ledger-qa"

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

  const businessLargeTextQaPath = resolveBusinessLargeTextQaPath(path, __DEV__)
  if (businessLargeTextQaPath) return businessLargeTextQaPath

  const onboardingMarketDayQaPath = resolveOnboardingMarketDayQaPath(
    path,
    __DEV__,
  )
  if (onboardingMarketDayQaPath) return onboardingMarketDayQaPath

  const orderDetailCurrentQaPath = resolveOrderDetailCurrentQaPath(
    path,
    __DEV__,
  )
  if (orderDetailCurrentQaPath) return orderDetailCurrentQaPath

  const ordersDispatchLedgerQaPath = resolveOrdersDispatchLedgerQaPath(
    path,
    __DEV__,
  )
  if (ordersDispatchLedgerQaPath) return ordersDispatchLedgerQaPath

  const qaPath = resolveCustomerConversationQaPath(path, __DEV__)
  if (qaPath) return qaPath

  const resolved = resolveCustomerDeepLink(path)
  if (resolved.pendingTransfer) {
    await initializeCustomerConversationStore()
    setPendingCustomerTransfer(resolved.pendingTransfer)
  }
  return resolved.path
}
