import type { HistoryDot } from "./finance-ledger-layout"

type When = Date | string

export type PurchaseTimelinePayment = {
  id: string
  amountMinor: string
  effectiveAt: When
  reference?: string | null
  reversedAt?: When | null
  reversalEffectiveAt?: When | null
  account: { name: string }
}

export type PurchaseTimelineAllocation = {
  id: string
  amountMinor: string
  effectiveAt: When
  releases: Array<{
    id: string
    amountMinor: string
    effectiveAt: When
    reason: string
  }>
}

export type PurchaseTimelineEntry<
  P extends PurchaseTimelinePayment,
  A extends PurchaseTimelineAllocation,
> = {
  id: string
  title: string
  /** Date first; the screen formats it with the rest of the detail. */
  at: When
  detail?: string
  amountMinor: string
  /** Reversals and releases lower what was paid or applied. */
  negative?: boolean
  dot: HistoryDot
  status?: string
  /** The row's own correction, kept from the old separate sections. */
  action?:
    | { kind: "reverse-payment"; payment: P }
    | { kind: "release"; allocation: A }
}

const time = (value: When) => new Date(value).getTime()

/**
 * Workshop 22/01 "Payments and advances": cash payments, their reversals,
 * advances applied and their releases on one rail, newest first, with the
 * purchase itself at the bottom. Each payment keeps "Reverse this payment"
 * until reversed; each allocation keeps "Release part" while some of it is
 * still applied and the purchase is not cancelled.
 */
export function purchasePaymentsTimeline<
  P extends PurchaseTimelinePayment,
  A extends PurchaseTimelineAllocation,
>(input: {
  payments: P[]
  allocations: A[]
  voided: boolean
  purchase: {
    id: string
    totalMinor: string
    incurredAt: When
    reference?: string | null
  }
}): PurchaseTimelineEntry<P, A>[] {
  // Derived events (reversal, release) sort above their source on a tie.
  const events: Array<PurchaseTimelineEntry<P, A> & { rank: number }> = []
  for (const payment of input.payments) {
    const reversedAt = payment.reversalEffectiveAt ?? payment.reversedAt
    events.push({
      id: `payment:${payment.id}`,
      title: `Payment, ${payment.account.name}`,
      at: payment.effectiveAt,
      detail: payment.reference ?? undefined,
      amountMinor: payment.amountMinor,
      dot: reversedAt ? "muted" : "ok",
      status: reversedAt ? "Reversed" : undefined,
      action: reversedAt ? undefined : { kind: "reverse-payment", payment },
      rank: 1,
    })
    if (reversedAt)
      events.push({
        id: `payment-reversal:${payment.id}`,
        title: "Payment reversed",
        at: reversedAt,
        detail: "original kept",
        amountMinor: payment.amountMinor,
        negative: true,
        dot: "warn",
        rank: 0,
      })
  }
  for (const allocation of input.allocations) {
    const released = allocation.releases.reduce(
      (sum, release) => sum + BigInt(release.amountMinor),
      0n,
    )
    const unreleased = BigInt(allocation.amountMinor) - released
    events.push({
      id: `allocation:${allocation.id}`,
      title: "Advance applied",
      at: allocation.effectiveAt,
      amountMinor: allocation.amountMinor,
      dot: unreleased > 0n ? "ok" : "muted",
      status: unreleased > 0n ? undefined : "Released",
      action:
        unreleased > 0n && !input.voided
          ? { kind: "release", allocation }
          : undefined,
      rank: 1,
    })
    for (const release of allocation.releases)
      events.push({
        id: `release:${release.id}`,
        title: "Advance released",
        at: release.effectiveAt,
        detail: release.reason,
        amountMinor: release.amountMinor,
        negative: true,
        dot: "warn",
        rank: 0,
      })
  }
  events.sort((a, b) => time(b.at) - time(a.at) || a.rank - b.rank)
  return [
    ...events.map(({ rank: _rank, ...entry }) => entry),
    {
      id: `purchase:${input.purchase.id}`,
      title: "Purchase recorded",
      at: input.purchase.incurredAt,
      detail: input.purchase.reference ?? undefined,
      amountMinor: input.purchase.totalMinor,
      dot: input.voided ? "muted" : "warn",
      status: input.voided ? "Cancelled" : undefined,
    },
  ]
}
