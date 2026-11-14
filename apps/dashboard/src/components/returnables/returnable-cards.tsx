"use client"

import {
  OverviewCard,
  Pill,
} from "@/components/orders/overview/order-overview-parts"
import { Button } from "@ewatrade/ui"
import { ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useState } from "react"
import {
  RecordReturnDialog,
  type RecordReturnTarget,
} from "./record-return-dialog"
import { ReturnableBadge } from "./returnable-badge"
import {
  daysOut,
  daysOutLabel,
  returnableCount,
  useOrderReturnables,
  useReturnableBalances,
} from "./use-returnables"

function RecordReturnButton({
  onClick,
  size = "sm",
}: {
  onClick: () => void
  size?: "sm" | "default"
}) {
  return (
    <Button variant="outline" size={size} onClick={onClick}>
      <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-4" />
      Record return
    </Button>
  )
}

/** Order overview: returnables that went out with this order. Hidden when none. */
export function OrderReturnablesCard({ orderId }: { orderId: string }) {
  const query = useOrderReturnables(orderId)
  const [target, setTarget] = useState<RecordReturnTarget | null>(null)
  const customerId = query.data?.customerId
  if (!query.data?.items.length) return null
  return (
    <OverviewCard title="Returnables">
      <ul className="divide-y divide-border">
        {query.data.items.map((item) => {
          const back = item.returned + item.writtenOff
          const out = Math.max(0, item.issued - back)
          return (
            <li key={item.catalogItemId} className="grid gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <ReturnableBadge />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {item.itemName}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {out}
                    <span className="text-sm font-medium text-muted-foreground">
                      {" still out"}
                    </span>
                  </p>
                </div>
                {out === 0 ? (
                  <Pill tone="green">All back</Pill>
                ) : customerId ? (
                  <RecordReturnButton
                    onClick={() =>
                      setTarget({
                        catalogItemId: item.catalogItemId,
                        customerId,
                        orderId,
                      })
                    }
                  />
                ) : null}
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${item.issued ? Math.min(100, (back / item.issued) * 100) : 0}%`,
                  }}
                />
              </div>
              <dl className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <dt>Went out</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {item.issued}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <div className="flex gap-1">
                    <dt>Back</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {item.returned}
                    </dd>
                  </div>
                  {item.writtenOff ? (
                    <div className="flex gap-1">
                      <dt>Lost</dt>
                      <dd className="font-medium text-foreground tabular-nums">
                        {item.writtenOff}
                      </dd>
                    </div>
                  ) : null}
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
      {target ? (
        <RecordReturnDialog target={target} onClose={() => setTarget(null)} />
      ) : null}
    </OverviewCard>
  )
}

/** Customer page: what this customer still holds. Hidden when nothing is out. */
export function CustomerReturnablesSection({
  customerId,
}: {
  customerId: string
}) {
  const query = useReturnableBalances({ customerId })
  const [target, setTarget] = useState<RecordReturnTarget | null>(null)
  if (!query.data?.length) return null
  const rows = query.data
  return (
    <section
      aria-label="Returnables"
      className="grid gap-3 rounded-xl border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Returnables</h2>
          <Link
            href="/customers/returnables"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            All customers’ returnables
          </Link>
        </div>
        <RecordReturnButton
          onClick={() =>
            setTarget({
              catalogItemId:
                rows.length === 1 ? rows[0]?.catalogItemId : undefined,
              customerId,
            })
          }
        />
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.catalogItemId} className="flex items-center gap-3">
            <ReturnableBadge />
            <div className="min-w-0">
              <p className="text-sm font-semibold tabular-nums">
                {`${returnableCount(row.out, row.itemName)} out`}
              </p>
              <p className="text-xs text-muted-foreground">
                {`Oldest ${daysOutLabel(daysOut(row.oldestOutAt)).toLowerCase()}${row.orderCount ? ` · ${row.orderCount} ${row.orderCount === 1 ? "order" : "orders"}` : ""}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {target ? (
        <RecordReturnDialog target={target} onClose={() => setTarget(null)} />
      ) : null}
    </section>
  )
}
