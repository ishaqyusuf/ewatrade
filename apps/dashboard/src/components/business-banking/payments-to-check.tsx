"use client"

import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { FormFeedback } from "@/components/forms/form-feedback"
import { orderMoney } from "@/components/orders/order-draft"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { SecondaryMenu } from "@/components/secondary-menu"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import { Badge, Button, cn } from "@ewatrade/ui"
import { ArrowLeft01Icon, InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { parseAsString, useQueryState } from "nuqs"
import { useEffect, useRef } from "react"
import { errorCode } from "./business-banking-model"
import { PaymentReportReview, formatReportTime } from "./payment-report-review"

const PAGE_SIZE = 20
/** New customer claims appear on an open page within this interval. */
const ARRIVAL_POLL_MS = 30_000
/** Claims are authority-scoped: always read fresh, never reuse a cached list. */
const FRESH = { staleTime: 0, gcTime: 0, refetchOnMount: "always" } as const
const pageSignature = (
  page: { items: { id: string; revision: number }[] } | undefined,
) => page?.items.map((item) => `${item.id}:${item.revision}`).join(",") ?? ""

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
  const listKey = [
    ...trpc.businessBanking.pendingReports.queryKey(),
    "payments-to-check",
  ]
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam, signal }) =>
      client.businessBanking.pendingReports.query(
        { limit: PAGE_SIZE, ...(pageParam ? { beforeId: pageParam } : {}) },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    ...FRESH,
  })
  // Only the first page is polled (paused while the tab is hidden); loaded
  // "Load more" pages are re-read once, and only when the first page changed.
  const arrivals = useQuery({
    ...trpc.businessBanking.pendingReports.queryOptions({ limit: PAGE_SIZE }),
    retry: false,
    refetchInterval: ARRIVAL_POLL_MS,
    ...FRESH,
  })
  const arrivedSignature = arrivals.isSuccess
    ? pageSignature(arrivals.data)
    : null
  const listedSignature = pageSignature(list.data?.pages[0])
  const listFetching = list.isFetching
  const refetchList = list.refetch
  const checkedArrival = useRef(0)
  useEffect(() => {
    if (
      arrivedSignature !== null &&
      list.isSuccess &&
      !listFetching &&
      checkedArrival.current !== arrivals.dataUpdatedAt
    ) {
      checkedArrival.current = arrivals.dataUpdatedAt
      if (arrivedSignature !== listedSignature) void refetchList()
    }
  }, [
    arrivedSignature,
    listedSignature,
    arrivals.dataUpdatedAt,
    list.isSuccess,
    listFetching,
    refetchList,
  ])
  // A failed current read (e.g. access removed) shows no previous claims.
  const failed = arrivals.isError || list.isError
  const loadError = arrivals.isError ? arrivals.error : list.error
  const items = failed
    ? []
    : (list.data?.pages.flatMap((page) => page.items) ?? [])
  // Only the claim list (and the notification bell) refresh after a review:
  // the open review keeps showing its result.
  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.businessBanking.pendingReports.queryKey(),
    })
  const selected = reportId
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6 pb-24">
        <PageHeader
          eyebrow="Business money"
          title="Payments to check"
          description="Customers who tapped I have paid. Check your bank before you confirm."
        >
          {showFinanceMenu ? (
            <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
          ) : null}
        </PageHeader>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section
            aria-label="Payments to check"
            className={cn(
              "grid min-w-0 content-start rounded-xl border border-border",
              selected && "max-lg:hidden",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">
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
                    onClick={() => {
                      void arrivals.refetch()
                      void list.refetch()
                    }}
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
                        "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        item.id === selected && "bg-muted",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      >
                        {initials(item.payerName)}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">
                          {item.payerName}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {item.orderNumber} ·{" "}
                          {formatReportTime(item.submittedAt, timeZone)}
                        </span>
                      </span>
                      <span className="grid justify-items-end gap-1">
                        <b className="text-sm font-semibold tabular-nums">
                          {orderMoney(item.amountMinor, item.currencyCode)}
                        </b>
                        <Badge variant="outline">To check</Badge>
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
                <span className="text-muted-foreground">
                  When a customer taps I have paid, it shows here.
                </span>
              </div>
            )}
            {list.isFetchNextPageError && !failed ? (
              <p role="alert" className="px-4 py-2 text-xs text-destructive">
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
            <section className="grid min-h-64 place-content-center justify-items-center gap-1 rounded-xl border border-dashed border-border p-6 text-center text-sm max-lg:hidden">
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
