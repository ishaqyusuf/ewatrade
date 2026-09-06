export const BUSINESS_HOME_MARKET_LEDGER_QA_STATES = [
  "attendant",
  "catalog-ready",
  "loading",
  "offline",
  "operational-empty",
  "operational-populated",
  "pending-sync",
  "setup",
] as const

export type BusinessHomeMarketLedgerQaState =
  (typeof BUSINESS_HOME_MARKET_LEDGER_QA_STATES)[number]

export function parseBusinessHomeMarketLedgerQaState(input: {
  development: boolean
  state?: string | string[] | null
}): BusinessHomeMarketLedgerQaState | null {
  if (!input.development || Array.isArray(input.state)) return null

  return BUSINESS_HOME_MARKET_LEDGER_QA_STATES.includes(
    input.state as BusinessHomeMarketLedgerQaState,
  )
    ? (input.state as BusinessHomeMarketLedgerQaState)
    : null
}

export function resolveBusinessHomeMarketLedgerQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null

  try {
    const url = new URL(path)
    const state = parseBusinessHomeMarketLedgerQaState({
      development,
      state: url.searchParams.get("state"),
    })
    if (
      !state ||
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "business-home-market-ledger"
    ) {
      return null
    }

    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    return `/design-system/business-home-market-ledger?state=${state}&theme=${theme}`
  } catch {
    return null
  }
}
