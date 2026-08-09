"use client"

import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

export function PrescriptionReport({
  from,
  initialStoreId,
  stores,
  to,
}: {
  from: Date
  initialStoreId: string
  stores: Array<{ id: string; name: string }>
  to: Date
}) {
  const trpc = useTRPC()
  const [storeId, setStoreId] = useState<string | null>(initialStoreId)
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
  const costLabels = {
    deliveryCostMinor: "Delivery costs",
    metaCostMinor: "Meta messaging charges",
    paymentProviderFeeMinor: "Payment-provider fees",
    pharmacyRevenueMinor: "Pharmacy revenue",
    platformChargeMinor: "EwaTrade platform charges",
    taxMinor: "Taxes",
  } as const
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
      <label className="grid max-w-sm gap-1 text-sm">
        Reporting scope
        <select
          className="h-10 rounded-lg border border-border bg-background px-3"
          value={storeId ?? ""}
          onChange={(event) => setStoreId(event.target.value || null)}
        >
          <option value="">All tenant stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
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
      <section className="grid gap-3 border border-border bg-card p-5">
        <h2 className="font-semibold">Quote outcomes</h2>
        <dl className="grid gap-2 sm:grid-cols-5">
          {Object.entries(data.quoteOutcomes).map(([outcome, count]) => (
            <div key={outcome}>
              <dt className="text-xs capitalize text-muted-foreground">
                {outcome}
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
      </section>
      <section className="grid gap-3 border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Commercial amounts by owner</h2>
          <p className="text-xs text-muted-foreground">
            Unknown provider costs stay unknown; they are never estimated or
            folded into another category.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(costLabels).map(([key, label]) => {
            const cost = data.costs[key as keyof typeof data.costs]
            return (
              <div className="border border-border p-4" key={key}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-medium">
                  {cost.amountMinor === null
                    ? "Unknown"
                    : formatMinorMoney(cost.amountMinor, data.currencyCode)}
                </dd>
                {cost.unknownCount > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {cost.unknownCount} applicable event
                    {cost.unknownCount === 1 ? "" : "s"} awaiting cost data
                  </p>
                ) : null}
              </div>
            )
          })}
        </dl>
      </section>
      {data.scope === "tenant" ? (
        <section className="grid gap-3 border border-border bg-card p-5">
          <h2 className="font-semibold">Store breakdown</h2>
          {data.storeBreakdown.map((store) => (
            <div className="flex justify-between text-sm" key={store.storeId}>
              <span>{store.name}</span>
              <span className="tabular-nums">
                {store.requestCount} requests
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
