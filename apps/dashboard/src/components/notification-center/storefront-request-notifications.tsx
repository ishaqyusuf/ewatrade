"use client"

import { formatReportTime } from "@/components/business-banking/report-time"
import { orderMoney } from "@/components/orders/order-draft"
import { useStorefrontRequestNotifications } from "@/hooks/use-business-notification-reads"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

/** "New website request …  [Open] [Mark as read]" rows above the alerts. */
export function StorefrontRequestNotifications({
  timeZone,
  onNavigate,
  onChanged,
}: {
  timeZone: string
  onNavigate: () => void
  /** Refreshes the bell's count after a row is marked read. */
  onChanged: () => void
}) {
  const trpc = useTRPC()
  const unread = useStorefrontRequestNotifications({ poll: false })
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Settles at the mutation level so the bell refreshes even after Open
  // closes the panel.
  const read = useMutation(
    trpc.storefrontRequests.readNotification.mutationOptions({
      onSettled: () => onChanged(),
    }),
  )
  const items = unread.isSuccess ? unread.data.items : []
  if (!items.length) return null

  function markRead(alertId: string) {
    setPendingId(alertId)
    setFailed(false)
    read.mutate(
      { alertId },
      {
        onError: () => setFailed(true),
        onSettled: () => {
          setPendingId(null)
          void unread.refetch()
        },
      },
    )
  }

  return (
    <section aria-label="Website requests" className="border-b">
      <p className="px-3.5 pt-2.5 text-xs font-medium text-muted-foreground">
        Website requests
      </p>
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2.5 border-b px-3.5 py-3 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-[7px] shrink-0 rounded-full bg-blue-600 dark:bg-blue-400"
            />
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <HugeiconsIcon icon={ShoppingCart01Icon} className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-[13.5px]">
                <strong>New website request</strong> {item.reference}
                {item.customerName ? ` from ${item.customerName}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.kind === "SERVICE" ? "Service" : "Order"} ·{" "}
                {formatReportTime(item.createdAt, timeZone)}
                {` · ${item.itemCount} ${item.itemCount === 1 ? "item" : "items"}`}
                {item.fulfilment
                  ? ` · ${item.fulfilment === "DELIVERY" ? "Delivery" : "Pickup"}`
                  : ""}
                {item.subtotalMinor !== null && item.currencyCode
                  ? ` · ${orderMoney(item.subtotalMinor, item.currencyCode)}`
                  : ""}
                {item.requestedAhead ? " · Requested ahead" : ""}
              </span>
              <span className="flex gap-2 pt-1">
                {item.requestId ? (
                  <Button
                    size="sm"
                    render={
                      <Link
                        href={`/website-requests?kind=${item.kind === "SERVICE" ? "services" : "products"}&show=open&request=${encodeURIComponent(item.requestId)}`}
                        onClick={() => {
                          // Opening never waits on, or depends on, the read state.
                          markRead(item.id)
                          onNavigate()
                        }}
                      />
                    }
                  >
                    Open
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === item.id}
                  onClick={() => markRead(item.id)}
                >
                  Mark as read
                </Button>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="px-3.5 pb-2.5 text-[13px] text-destructive">
          Couldn't mark that request as read. Try again.
        </p>
      ) : null}
    </section>
  )
}
