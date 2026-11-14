"use client"

import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { FormFeedback } from "@/components/forms/form-feedback"
import { orderMoney } from "@/components/orders/order-draft"
import { ScrollableContent } from "@/components/scrollable-content"
import { SecondaryMenu } from "@/components/secondary-menu"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import { isRejectedRead } from "@/trpc/query-read-errors"
import { Button, cn } from "@ewatrade/ui"
import { ArrowLeft01Icon, InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { parseAsString, useQueryState } from "nuqs"
import { useEffect, useMemo } from "react"
import { errorCode, formatReportTime } from "./business-banking-model"
import { PaymentReportReview } from "./payment-report-review"

const PAGE_SIZE = 20
/** Claims are authority-scoped: always read fresh, never reuse a cached list. */
const FRESH = { staleTime: 0, gcTime: 0, refetchOnMount: "always" } as const

/**
 * Finance → Payments to check (Business banking 02 "Payments inbox"):
 * customer claims on the left, the selected review on the right. The
 * selected report lives in the URL (?reportId=).
 */
export function PaymentsToCheck({
  timeZone,
  showFinanceMenu,
}: {
  timeZone: string
  /** Owner/Admin see the Finance tabs; other staff only this page. */
  showFinanceMenu: boolean
}) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const [reportId, setReportId] = useQueryState("reportId", parseAsString)
  const listKey = useMemo(
    () => [
      ...trpc.businessBanking.pendingReports.queryKey(),
      "payments-to-check",
    ],
    [trpc],
  )
  // No timer: the list (every loaded page) re-reads when the tab gets focus
  // and after a review.
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam, signal }) =>
      client.businessBanking.pendingReports.query(
        pageParam
          ? { limit: PAGE_SIZE, beforeId: pageParam }
          : { limit: PAGE_SIZE },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    ...FRESH,
    refetchOnWindowFocus: "always",
  })
  // A failed current read (e.g. access removed) shows no previous claims.
  const failed = list.isError
  const loadError = list.error
  useEffect(() => {
    if (!isRejectedRead(list.error)) return
    const retained = queryClient
      .getQueryCache()
      .find<unknown, unknown>({ queryKey: listKey, exact: true })
    if (!retained?.state.data) return
    // A refused read also revokes its retained paginated projection.
    retained.setState({
      data: undefined,
      error: list.error,
      status: "error",
    })
  }, [list.error, listKey, queryClient])
  const items = failed
    ? []
    : (list.data?.pages.flatMap((page) => page.items) ?? [])
  // Only the claim list (and the notification bell) refresh after a review:
  // the open review keeps showing its result.
  const refreshList = async () => {
    // Discard pre-command reads, then let both owners join one fresh first page.
    await queryClient.cancelQueries({
      queryKey: trpc.businessBanking.pendingReports.queryKey(),
    })
    return Promise.all([
      queryClient.invalidateQueries(
        {
          queryKey: trpc.businessBanking.pendingReports.queryKey(),
        },
        { cancelRefetch: false },
      ),
      queryClient.invalidateQueries({
        queryKey: trpc.businessBanking.pendingReportCount.pathKey(),
      }),
    ])
  }
  const selected = reportId
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6 pb-24">
        {showFinanceMenu ? (
          <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
        ) : null}
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section
            aria-label="Payments to check"
            className={cn(
              "grid min-w-0 content-start overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card",
              selected && "max-lg:hidden",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="font-semibold">
                To check{items.length ? ` · ${items.length}` : ""}
                {items.length && list.hasNextPage ? "+" : ""}
              </h2>
            </header>
            {list.isPending ? (
              <output
                aria-live="polite"
                className="block px-4 py-8 text-center text-sm text-muted-foreground"
              >
                Loading payments…
              </output>
            ) : failed ? (
              <div role="alert" className="grid gap-3 p-4">
                <FormFeedback appearance="dashboard">
                  {errorCode(loadError) === "FORBIDDEN"
                    ? "Only staff who can take payments can check payments."
                    : "Payments to check couldn't load."}
                </FormFeedback>
                {errorCode(loadError) === "FORBIDDEN" ? null : (
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() => void list.refetch()}
                  >
                    Try again
                  </Button>
                )}
              </div>
            ) : items.length ? (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={item.id === selected ? "true" : undefined}
                      onClick={() => void setReportId(item.id)}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        item.id === selected && "bg-[var(--hover)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--avatar)] text-sm font-semibold"
                      >
                        {initials(item.payerName)}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">
                          {item.payerName}
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {item.orderNumber} ·{" "}
                          {item.paymentReference
                            ? `${item.paymentReference} · `
                            : ""}
                          {formatReportTime(item.submittedAt, timeZone)}
                        </span>
                      </span>
                      <span className="grid justify-items-end gap-1">
                        <b className="font-semibold tabular-nums">
                          {orderMoney(item.amountMinor, item.currencyCode)}
                        </b>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid justify-items-center gap-1 px-4 py-10 text-center text-sm">
                <HugeiconsIcon
                  icon={InboxIcon}
                  className="size-6 text-muted-foreground"
                  aria-hidden
                />
                <b className="font-medium">Nothing to check</b>
              </div>
            )}
            {list.isFetchNextPageError && !failed ? (
              <p role="alert" className="px-4 py-2 text-sm text-destructive">
                More payments couldn't load. Try Load more again.
              </p>
            ) : null}
            {list.hasNextPage && !failed ? (
              <div className="flex justify-center border-t border-border py-3">
                <Button
                  variant="outline"
                  disabled={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  {list.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </section>
          {selected ? (
            <div className="grid min-w-0 gap-3">
              <Button
                variant="ghost"
                className="w-fit lg:hidden"
                onClick={() => void setReportId(null)}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  data-icon="inline-start"
                />
                All payments to check
              </Button>
              <PaymentReportReview
                key={selected}
                reportId={selected}
                timeZone={timeZone}
                onReviewed={refreshList}
                onClose={() => void setReportId(null)}
              />
            </div>
          ) : (
            <section className="grid min-h-64 place-content-center justify-items-center gap-1 rounded-[var(--ui-radius-surface)] border border-dashed border-border p-6 text-center max-lg:hidden">
              <HugeiconsIcon
                icon={InboxIcon}
                className="size-6 text-muted-foreground"
                aria-hidden
              />
              <b className="font-medium">
                {items.length ? "Choose a payment to check" : "All checked"}
              </b>
              {items.length ? (
                <span className="text-muted-foreground">
                  {items.length === 1
                    ? "1 customer says they paid."
                    : `${items.length}${list.hasNextPage ? "+" : ""} customers say they paid.`}
                </span>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </ScrollableContent>
  )
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}
