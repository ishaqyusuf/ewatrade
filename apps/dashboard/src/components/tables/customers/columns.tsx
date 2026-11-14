import type {
  DashboardCustomerBalance,
  DashboardCustomerRow,
} from "@/lib/sales-operations"

/** Balance and contact helpers shared by the customer list and sheet. */

export type CustomerBalanceView =
  | { kind: "settled" }
  | { kind: "owes"; amountMinor: string; afterPaidAheadMinor: string | null }
  | { kind: "paidAhead"; amountMinor: string }

/** Owing wins: the amount is net of any money paid ahead and says so. */
export function describeCustomerBalance(
  balance: DashboardCustomerBalance,
): CustomerBalanceView {
  const owed = BigInt(balance.owedMinor)
  const paidAhead = BigInt(balance.paidAheadMinor)
  const net = BigInt(balance.netMinor)
  if (owed > BigInt(0) && net > BigInt(0))
    return {
      kind: "owes",
      amountMinor: net.toString(),
      afterPaidAheadMinor: paidAhead > BigInt(0) ? paidAhead.toString() : null,
    }
  if (paidAhead > BigInt(0) && net < BigInt(0))
    return { kind: "paidAhead", amountMinor: (-net).toString() }
  return { kind: "settled" }
}

export function getCustomerContact(customer: DashboardCustomerRow) {
  return (
    customer.phone ??
    customer.email ??
    (customer.identityType === "walk-in"
      ? "Sales with no customer details"
      : "No phone or email")
  )
}

export function compareCustomerTotals(left: string, right: string) {
  const leftMinor = BigInt(left)
  const rightMinor = BigInt(right)
  return leftMinor < rightMinor ? -1 : leftMinor > rightMinor ? 1 : 0
}

/** Net balance order; customers without an account sort below everyone. */
export function compareCustomerBalances(
  left: DashboardCustomerBalance | null,
  right: DashboardCustomerBalance | null,
) {
  if (!left || !right) return left ? 1 : right ? -1 : 0
  return compareCustomerTotals(left.netMinor, right.netMinor)
}

export function formatCustomerDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date)
}
