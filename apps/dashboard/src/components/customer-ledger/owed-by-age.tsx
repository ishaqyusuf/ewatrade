"use client"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

type Aging = RouterOutputs["customerLedger"]["aging"]
type BucketKey = Aging["buckets"][number]["key"]

export const owedBucketLabels: Record<BucketKey, string> = {
  DAYS_0_30: "0–30 days",
  DAYS_31_60: "31–60 days",
  DAYS_61_90: "61–90 days",
  DAYS_OVER_90: "Over 90 days",
}

// Lighter to darker amber as the debt gets older.
const bucketColors: Record<BucketKey, string> = {
  DAYS_0_30: "bg-amber-300 dark:bg-amber-200/70",
  DAYS_31_60: "bg-amber-400 dark:bg-amber-300/80",
  DAYS_61_90: "bg-amber-600 dark:bg-amber-400",
  DAYS_OVER_90: "bg-amber-800 dark:bg-amber-500",
}

const day = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })

/**
 * Workshop customers-pages 04: what the customer owes in all, by age, under
 * the three statement totals. Includes unpaid linked Orders that aren't on the
 * statement yet; paid-ahead money is never netted into the buckets.
 */
export function OwedByAge({ accountId }: { accountId: string }) {
  const trpc = useTRPC()
  const [showOrders, setShowOrders] = useState(false)
  const query = useQuery(
    trpc.customerLedger.aging.queryOptions({ accountId }, { retry: false }),
  )
  if (query.isPending)
    return (
      <output
        aria-busy="true"
        className="block h-28 animate-pulse border border-border bg-muted/40"
      />
    )
  if (query.isError)
    return (
      <div className="flex flex-wrap items-center gap-3 border border-border p-4 text-sm text-muted-foreground">
        Couldn’t work out how long they’ve owed.
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const aging = query.data
  const total = BigInt(aging.totalOwedMinor)
  if (total === BigInt(0)) return null
  const money = (value: string) => formatFinanceMoney(value, aging.currencyCode)
  const orders = aging.unpaidOrders
  return (
    <section
      aria-label="What they owe, by age"
      className="grid gap-3 border border-border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Owes you {money(aging.totalOwedMinor)} in all
        </h2>
        {aging.oldestOwedAt ? (
          <span className="text-sm text-muted-foreground">
            Oldest since {day.format(new Date(aging.oldestOwedAt))}
          </span>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        {aging.buckets.map((bucket) =>
          BigInt(bucket.totalMinor) > BigInt(0) ? (
            <span
              key={bucket.key}
              className={bucketColors[bucket.key]}
              style={{
                width: `${Number((BigInt(bucket.totalMinor) * BigInt(10000)) / total) / 100}%`,
              }}
            />
          ) : null,
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {aging.buckets.map((bucket) => {
          const owed = BigInt(bucket.totalMinor) > BigInt(0)
          return (
            <div key={bucket.key} className="grid gap-0.5">
              <dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-[2px] ${bucketColors[bucket.key]}`}
                />
                {owedBucketLabels[bucket.key]}
              </dt>
              <dd
                className={`text-sm tabular-nums ${owed ? "font-semibold" : "text-muted-foreground"}`}
              >
                {money(bucket.totalMinor)}
              </dd>
            </div>
          )
        })}
      </dl>
      {orders.count ? (
        <div className="grid gap-2 border-t border-border pt-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {money(aging.ordersOwedMinor)} of this is on {orders.count} unpaid{" "}
              {orders.count === 1 ? "Order" : "Orders"} that{" "}
              {orders.count === 1 ? "isn’t" : "aren’t"} on the statement yet.
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-expanded={showOrders}
              onClick={() => setShowOrders((open) => !open)}
            >
              {showOrders
                ? "Hide Orders"
                : `See ${orders.count === 1 ? "Order" : "Orders"}`}
            </Button>
          </div>
          {showOrders ? (
            <ul className="grid divide-y divide-border border border-border">
              {orders.items.map((order) => (
                <li
                  key={order.orderId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <Link
                    href={`/sales/orders/${order.orderId}`}
                    className="font-medium hover:underline"
                  >
                    Order {order.orderNumber}
                  </Link>
                  <span className="text-muted-foreground">
                    {day.format(new Date(order.createdAt))} ·{" "}
                    {owedBucketLabels[order.bucket]}
                  </span>
                  <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                    {money(order.balanceMinor)} left
                  </span>
                </li>
              ))}
              {orders.count > orders.items.length ? (
                <li className="px-3 py-2 text-muted-foreground">
                  Showing the oldest {orders.items.length} of {orders.count}.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
