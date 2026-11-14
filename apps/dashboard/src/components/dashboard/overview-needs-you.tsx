"use client"

import {
  ChangeApprovalRows,
  usePendingChangeApprovals,
} from "@/components/orders/overview/order-change-approvals"
import {
  OrderVisibilityQuestion,
  useOrderVisibility,
} from "@/components/staff/order-visibility-card"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

/**
 * Overview: everything waiting on an Owner/Admin in one card — return and
 * refund requests, cashier receipts sent for approval, then the one-time
 * question about what cashiers see. Hidden when nothing is waiting.
 * Refreshes on window focus and after its own actions; it never polls.
 */
export function OverviewNeedsYou({
  storeId,
  storeName,
  timeZone,
}: {
  storeId: string
  storeName: string
  timeZone: string
}) {
  const approvals = usePendingChangeApprovals()
  const trpc = useTRPC()
  const receipts =
    useQuery(
      trpc.assistant.receiptApprovals.queryOptions(undefined, {
        refetchOnWindowFocus: "always",
        retry: false,
      }),
    ).data ?? []
  const visibility = useOrderVisibility(storeId)
  const rows = approvals.data ?? []
  const review =
    visibility.data && !visibility.data.salesRepOrderVisibilityReviewedAt
      ? visibility.data
      : null
  const count = rows.length + receipts.length + (review ? 1 : 0)
  if (!count) return null
  return (
    <section
      aria-labelledby="needs-you-title"
      className="grid gap-4 rounded-[var(--ui-radius-surface)] border border-warning-border bg-card p-4 sm:p-5"
    >
      <h2
        id="needs-you-title"
        className="flex items-center gap-2 text-lg font-semibold"
      >
        Needs you
        <span className="inline-grid h-7 min-w-7 place-items-center rounded-full bg-warning px-2 text-sm font-semibold text-warning-foreground tabular-nums">
          {count}
        </span>
      </h2>
      {rows.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Returns and refunds to approve today
          </h3>
          <ChangeApprovalRows
            rows={rows}
            timeZone={timeZone}
            onDone={() => approvals.refetch()}
          />
        </div>
      ) : null}
      {receipts.length ? (
        <div
          className={
            rows.length
              ? "grid gap-2 border-t border-border pt-4"
              : "grid gap-2"
          }
        >
          <h3 className="text-sm font-medium text-muted-foreground">
            Receipts to approve
          </h3>
          <ul className="grid gap-2">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link
                  href={`/receipt-approval/${receipt.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--ui-radius-control)] border border-border bg-background px-3.5 py-2.5 hover:bg-[var(--hover)]"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {receipt.requestedBy} · {receipt.kind}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {receipt.summary.split("\n")[0]}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-[var(--link)]">
                    Review
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {review ? (
        <div className={count > 1 ? "border-t border-border pt-4" : ""}>
          <OrderVisibilityQuestion
            storeId={storeId}
            storeName={storeName}
            data={review}
          />
        </div>
      ) : null}
    </section>
  )
}
