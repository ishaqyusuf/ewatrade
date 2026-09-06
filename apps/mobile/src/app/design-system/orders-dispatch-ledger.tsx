import { OrdersDispatchLedgerQaScreen } from "@/components/mobile/orders-dispatch-ledger-qa-screen"
import {
  ORDERS_DISPATCH_LEDGER_QA_STATES,
  type OrdersDispatchLedgerQaState,
} from "@/lib/orders-dispatch-ledger-qa"
import { Redirect, useLocalSearchParams } from "expo-router"

const QA_STATES = new Set<OrdersDispatchLedgerQaState>(
  ORDERS_DISPATCH_LEDGER_QA_STATES,
)

export default function OrdersDispatchLedgerQaRoute() {
  const { state: rawState, theme: rawTheme } = useLocalSearchParams<{
    state?: string | string[]
    theme?: string | string[]
  }>()
  const state = Array.isArray(rawState) ? rawState[0] : rawState
  const theme = Array.isArray(rawTheme) ? rawTheme[0] : rawTheme

  if (
    !__DEV__ ||
    !state ||
    !QA_STATES.has(state as OrdersDispatchLedgerQaState)
  ) {
    return <Redirect href="/design-system" />
  }

  return (
    <OrdersDispatchLedgerQaScreen
      key={`${state}-${theme === "dark" ? "dark" : "light"}`}
      state={state as OrdersDispatchLedgerQaState}
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
