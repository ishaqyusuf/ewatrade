"use client"

import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"

export function PrescriptionReport({
  from,
  storeId,
  to,
}: {
  from: Date
  storeId: string
  to: Date
}) {
  const trpc = useTRPC()
  const report = useQuery(
    trpc.prescriptions.report.queryOptions({ from, storeId, to }),
  )
  if (report.isLoading) {
    return <div className="h-72 animate-pulse bg-muted" />
  }
  if (!report.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Prescription reporting is unavailable.
      </p>
    )
  }
  const data = report.data
  const cards = [
    ["Requests", data.requestCount],
    ["Quotes", data.quoteCount],
    ["Paid orders", data.payment.paidCount],
    ["Pickup completed", data.pickupCompleted],
    ["Delivery completed", data.deliveryCompleted],
    ["Conversion", `${Math.round(data.conversionRate * 100)}%`],
  ]
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => (
          <div className="border border-border bg-card p-5" key={String(label)}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="grid gap-3 border border-border bg-card p-5">
        <h2 className="font-semibold">Channel mix</h2>
        <dl className="grid gap-2 sm:grid-cols-4">
          {Object.entries(data.channelMix).map(([channel, count]) => (
            <div key={channel}>
              <dt className="text-xs capitalize text-muted-foreground">
                {channel.replaceAll("_", " ")}
              </dt>
              <dd className="text-xl font-medium tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="border border-border bg-card p-5">
        <h2 className="font-semibold">Payments</h2>
        <p className="mt-2 text-2xl font-semibold">
          {formatMinorMoney(data.payment.paidAmountMinor, data.currencyCode)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Provider costs remain unknown until reconciled. Platform charges, Meta
          charges, payment fees, delivery costs, taxes, and pharmacy revenue are
          stored separately.
        </p>
      </section>
    </div>
  )
}
