export const SALES_REP_SHIFT_LEDGER_QA_STATES = [
  "disabled",
  "empty",
  "error",
  "loading",
  "offline",
  "operational-populated",
  "pending-sync",
] as const

export type SalesRepShiftLedgerQaState =
  (typeof SALES_REP_SHIFT_LEDGER_QA_STATES)[number]

export function resolveSalesRepShiftLedgerQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null

  try {
    const url = new URL(path)
    const state = url.searchParams.get("state")
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "sales-rep-home-shift-ledger" ||
      !SALES_REP_SHIFT_LEDGER_QA_STATES.includes(
        state as SalesRepShiftLedgerQaState,
      )
    ) {
      return null
    }

    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light"
    return `/design-system/sales-rep-home-shift-ledger?state=${state}&theme=${theme}`
  } catch {
    return null
  }
}
