export const ORDERS_DISPATCH_LEDGER_QA_STATES = [
  "error",
  "filtered-empty",
  "first-order",
  "loading",
  "offline",
  "pending-sync",
  "populated",
] as const

export type OrdersDispatchLedgerQaState =
  (typeof ORDERS_DISPATCH_LEDGER_QA_STATES)[number]

export function parseOrdersDispatchLedgerQaState(input: {
  development: boolean
  state?: string | string[] | null
}): OrdersDispatchLedgerQaState | null {
  if (!input.development || Array.isArray(input.state)) return null
  return ORDERS_DISPATCH_LEDGER_QA_STATES.includes(
    input.state as OrdersDispatchLedgerQaState,
  )
    ? (input.state as OrdersDispatchLedgerQaState)
    : null
}

export function resolveOrdersDispatchLedgerQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null
  try {
    const url = new URL(path)
    const state = parseOrdersDispatchLedgerQaState({
      development,
      state: url.searchParams.get("state"),
    })
    const stateValues = url.searchParams.getAll("state")
    const themeValues = url.searchParams.getAll("theme")
    const queryKeys = [...new Set(url.searchParams.keys())]
    const theme = themeValues[0] ?? "light"
    if (
      !state ||
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "orders-dispatch-ledger" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      stateValues.length !== 1 ||
      themeValues.length > 1 ||
      queryKeys.some((key) => key !== "state" && key !== "theme") ||
      (theme !== "light" && theme !== "dark")
    ) {
      return null
    }
    return `/design-system/orders-dispatch-ledger?state=${state}&theme=${theme}`
  } catch {
    return null
  }
}
