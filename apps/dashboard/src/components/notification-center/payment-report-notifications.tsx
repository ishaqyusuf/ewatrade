"use client"

import { formatReportTime } from "@/components/business-banking/payment-report-review"
import { orderMoney } from "@/components/orders/order-draft"
import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { Button } from "@ewatrade/ui"
import { BankIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

const PREVIEW_LIMIT = 5

/**
 * Customer payment claims waiting for a check. Each mounted consumer owns its
 * read generation, refreshes on focus and polls while active. The panel gets
 * a fresh generation each time it opens.
 */
export function usePendingPaymentReports() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.pendingReports.queryOptions(
        { limit: PREVIEW_LIMIT },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          refetchInterval: 30_000,
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
}

/** "Payment notification from … [Open] [Evaluate]" rows above the alerts. */
export function PaymentReportNotifications({
  timeZone,
  onNavigate,
}: {
  timeZone: string
  onNavigate: () => void
}) {
  const pending = usePendingPaymentReports()
  const items = pending.isSuccess ? pending.data.items : []
  if (!items.length) return null
  return (
    <section aria-label="Payments to check" className="border-b">
      <p className="px-3.5 pt-2.5 text-xs font-medium text-muted-foreground">
        Payments to check
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
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <HugeiconsIcon icon={BankIcon} className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-[13.5px]">
                Payment notification from <strong>{item.payerName}</strong>.{" "}
                {orderMoney(item.amountMinor, item.currencyCode)} for order{" "}
                {item.orderNumber}.
              </span>
              <span className="text-xs text-muted-foreground">
                {formatReportTime(item.submittedAt, timeZone)} · Not recorded
                until someone checks it
              </span>
              <span className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link
                      href={`/sales/orders/${encodeURIComponent(item.orderId)}`}
                      onClick={onNavigate}
                    />
                  }
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  render={
                    <Link
                      href={`/finance/payments?reportId=${encodeURIComponent(item.id)}`}
                      onClick={onNavigate}
                    />
                  }
                >
                  Evaluate
                </Button>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {pending.data?.nextCursor ? (
        <Link
          href="/finance/payments"
          onClick={onNavigate}
          className="block px-3.5 pb-2.5 text-[13px] underline underline-offset-3"
        >
          See all payments to check
        </Link>
      ) : null}
    </section>
  )
}
