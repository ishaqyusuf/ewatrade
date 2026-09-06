import { SalesRepShiftLedgerQaScreen } from "@/components/mobile/sales-rep-shift-ledger-qa-screen"
import {
  SALES_REP_SHIFT_LEDGER_QA_STATES,
  type SalesRepShiftLedgerQaState,
} from "@/lib/sales-rep-shift-ledger-qa"
import { Redirect, useLocalSearchParams } from "expo-router"

const QA_STATES = new Set<SalesRepShiftLedgerQaState>(
  SALES_REP_SHIFT_LEDGER_QA_STATES,
)

export default function SalesRepShiftLedgerQaRoute() {
  const { state: rawState, theme: rawTheme } = useLocalSearchParams<{
    state?: string | string[]
    theme?: string | string[]
  }>()
  const state = Array.isArray(rawState) ? rawState[0] : rawState
  const theme = Array.isArray(rawTheme) ? rawTheme[0] : rawTheme

  if (
    !__DEV__ ||
    !state ||
    !QA_STATES.has(state as SalesRepShiftLedgerQaState)
  ) {
    return <Redirect href="/design-system" />
  }

  return (
    <SalesRepShiftLedgerQaScreen
      key={`${state}-${theme === "dark" ? "dark" : "light"}`}
      state={state as SalesRepShiftLedgerQaState}
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
