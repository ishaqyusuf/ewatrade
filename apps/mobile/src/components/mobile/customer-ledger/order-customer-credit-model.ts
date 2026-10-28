import { normalizeMobileRole } from "@/lib/mobile-roles"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

/** businessBanking.orderCustomerFunds: Finance-only, Order-scoped. */
export type OrderCustomerFunds = {
  availableMinor: string
  reservedMinor: string
  currencyCode: string
  accountId: string
  accountRevision: string
  showCredit: boolean
} | null

/** Only owners and admins can read customer funds. */
export function canSeeOrderCustomerCredit(role: string | undefined) {
  return ["OWNER", "ADMIN"].includes(normalizeMobileRole(role))
}

const MINOR = /^(0|[1-9]\d*)$/

/**
 * What the Order shows about the customer's credit. Hidden when the server
 * says there's nothing to show (no customer, no ledger, or no credit). A
 * missing answer is never shown as zero.
 */
export function orderCustomerCreditView(input: {
  allowed: boolean
  offline: boolean
  status: "pending" | "error" | "success"
  data: OrderCustomerFunds | undefined
}) {
  if (!input.allowed) return { kind: "hidden" as const }
  if (input.offline) return { kind: "offline" as const }
  if (input.status === "error") return { kind: "error" as const }
  if (input.status === "pending" || input.data === undefined)
    return { kind: "loading" as const }
  const funds = input.data
  if (!funds || !funds.showCredit) return { kind: "hidden" as const }
  if (!MINOR.test(funds.availableMinor) || !MINOR.test(funds.reservedMinor))
    return { kind: "unavailable" as const }
  const available = BigInt(funds.availableMinor)
  const reserved = BigInt(funds.reservedMinor)
  if (available <= 0n) return { kind: "unavailable" as const }
  try {
    return {
      kind: "credit" as const,
      accountId: funds.accountId,
      available: formatFinanceMoney(funds.availableMinor, funds.currencyCode),
      reserved:
        reserved > 0n
          ? formatFinanceMoney(funds.reservedMinor, funds.currencyCode)
          : null,
    }
  } catch {
    return { kind: "unavailable" as const }
  }
}

export type OrderCustomerCreditView = ReturnType<typeof orderCustomerCreditView>
