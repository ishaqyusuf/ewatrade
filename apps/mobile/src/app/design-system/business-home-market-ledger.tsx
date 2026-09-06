import { BusinessHomeMarketLedgerQaScreen } from "@/components/mobile/business-home-market-ledger-qa-screen"
import {
  BUSINESS_HOME_MARKET_LEDGER_QA_STATES,
  type BusinessHomeMarketLedgerQaState,
} from "@/lib/business-home-market-ledger-qa"
import { Redirect, useLocalSearchParams } from "expo-router"

const QA_STATES = new Set<BusinessHomeMarketLedgerQaState>(
  BUSINESS_HOME_MARKET_LEDGER_QA_STATES,
)

export default function BusinessHomeMarketLedgerQaRoute() {
  const { state: rawState, theme: rawTheme } = useLocalSearchParams<{
    state?: string | string[]
    theme?: string | string[]
  }>()
  const state = Array.isArray(rawState) ? rawState[0] : rawState
  const theme = Array.isArray(rawTheme) ? rawTheme[0] : rawTheme

  if (
    !__DEV__ ||
    !state ||
    !QA_STATES.has(state as BusinessHomeMarketLedgerQaState)
  ) {
    return <Redirect href="/design-system" />
  }

  return (
    <BusinessHomeMarketLedgerQaScreen
      key={`${state}-${theme === "dark" ? "dark" : "light"}`}
      state={state as BusinessHomeMarketLedgerQaState}
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
