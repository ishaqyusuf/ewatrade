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
 * question about what cashiers see.
 * Hidden when nothing is waiting.
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
        refetchInterval: 60_000,
        retry: false,
      }),
    ).data ?? []
  const visibility = useOrderVisibility(storeId, true)
  const rows = approvals.data ?? []
  const review =
    visibility.data && !visibility.data.salesRepOrderVisibilityReviewedAt
      ? visibility.data
      : null
  if (!rows.length && !receipts.length && !review) return null
  return (
    <section
      aria-labelledby="needs-you-title"
      className="grid gap-3 rounded-lg border border-amber-500/35 bg-amber-500/5 p-4 sm:p-5"
    >
      <h2
        id="needs-you-title"
        className="flex items-center gap-2 font-semibold"
      >
        Needs you
        <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-amber-950">
          {rows.length + receipts.length + (review ? 1 : 0)}
        </span>
      </h2>
      {rows.length ? (
        <>
          <p className="-mt-1 text-sm text-muted-foreground">
            Returns and refunds asked for today. Once approved, they must be
            recorded by the end of the day.
          </p>
          <ChangeApprovalRows
            rows={rows}
            timeZone={timeZone}
            onDone={() => approvals.refetch()}
          />
        </>
      ) : null}
      {receipts.length ? (
        <div
          className={
            rows.length
              ? "grid gap-2 border-t border-border pt-3"
              : "grid gap-2"
          }
        >
          <p className="text-sm text-muted-foreground">
            Receipts staff sent for approval. Nothing is saved until you
            approve.
          </p>
          <ul className="grid gap-2">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link
                  href={`/receipt-approval/${receipt.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {receipt.requestedBy} · {receipt.kind}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {receipt.summary.split("\n")[0]}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">Review</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {review ? (
        <div className="border-t border-border pt-3">
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
