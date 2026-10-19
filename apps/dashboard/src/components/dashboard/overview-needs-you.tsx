"use client"

import {
  ChangeApprovalRows,
  usePendingChangeApprovals,
} from "@/components/orders/overview/order-change-approvals"
import {
  OrderVisibilityQuestion,
  useOrderVisibility,
} from "@/components/staff/order-visibility-card"

/**
 * Overview: everything waiting on an Owner/Admin in one card — return and
 * refund requests, then the one-time question about what cashiers see.
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
  const visibility = useOrderVisibility(storeId, true)
  const rows = approvals.data ?? []
  const review =
    visibility.data && !visibility.data.salesRepOrderVisibilityReviewedAt
      ? visibility.data
      : null
  if (!rows.length && !review) return null
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
          {rows.length + (review ? 1 : 0)}
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
