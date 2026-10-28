import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

/**
 * Whether an Order shows its customer's unused credit (MB-01). Only a fresh,
 * successful Owner/Admin read with a positive amount in the Order's currency
 * shows anything. Unknown access, loading and failures are never a zero.
 */

export type OrderCustomerFunds =
  RouterOutputs["businessBanking"]["orderCustomerFunds"]

export type OrderCreditView =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "changed" }
  | {
      kind: "credit"
      availableMinor: string
      currencyCode: string
      accountId: string
    }

export function orderCreditView(input: {
  /** Owner/Admin from the current tenant context; null while unknown. */
  allowed: boolean | null
  status: "pending" | "error" | "success"
  /** The server refused Finance access (role or plan): show nothing. */
  forbidden: boolean
  /** False while a remounted read still shows an earlier cached answer. */
  fetchedAfterMount: boolean
  data: OrderCustomerFunds | undefined
  orderId: string
  customerId: string | null
  orderCurrency: string
}): OrderCreditView {
  if (input.allowed !== true) return { kind: "hidden" }
  if (input.status === "error")
    return input.forbidden ? { kind: "hidden" } : { kind: "unavailable" }
  if (input.status === "pending" || !input.fetchedAfterMount)
    return { kind: "loading" }
  const funds = input.data
  // No customer or no balance set up: nothing to show.
  if (funds === null) return { kind: "hidden" }
  if (!funds) return { kind: "unavailable" }
  if (funds.orderId !== input.orderId || funds.customerId !== input.customerId)
    return { kind: "changed" }
  if (funds.currencyCode !== input.orderCurrency) return { kind: "unavailable" }
  if (!funds.showCredit || funds.availableMinor === "0")
    return { kind: "hidden" }
  if (!/^[1-9]\d{0,18}$/.test(funds.availableMinor))
    return { kind: "unavailable" }
  return {
    kind: "credit",
    availableMinor: funds.availableMinor,
    currencyCode: funds.currencyCode,
    accountId: funds.accountId,
  }
}

/**
 * When the Order's customer, currency or money changes, the credit is read
 * again from scratch, so an earlier customer's credit is never shown.
 */
export function orderCreditIdentity(order: {
  id: string
  customerId: string | null
  currencyCode: string
  totalMinor: number
  amountPaidMinor: number
  creditMinor: number
  balanceDueMinor: number
}) {
  return JSON.stringify([
    order.id,
    order.customerId ?? "",
    order.currencyCode,
    order.totalMinor,
    order.amountPaidMinor,
    order.creditMinor,
    order.balanceDueMinor,
  ])
}
