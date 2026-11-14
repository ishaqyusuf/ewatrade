"use client"
import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { SecondaryMenu } from "@/components/secondary-menu"
import { CustomerAccountsList } from "@/components/tables/customer-accounts/list"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { useMemo } from "react"
import {
  CustomerBalanceSearch,
  CustomerBalanceSortMenu,
  useCustomerBalanceParams,
} from "./customer-balances-controls"

/** What each saved customer owes you; a row opens the customer's details. */
export function CustomerLedgerDirectory() {
  const trpc = useTRPC()
  const [, setDetail] = useQueryStates(
    { customerDetail: parseAsString },
    { history: "push" },
  )
  const [params] = useCustomerBalanceParams()
  const search = params.customerSearch.trim()
  const query = useInfiniteQuery(
    trpc.finance.customerBalanceDirectory.infiniteQueryOptions(
      {
        query: search || undefined,
        filter: params.customerFilter ?? undefined,
        sort: params.customerSort,
        limit: 30,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const first = query.data?.pages[0]
  const filtered = Boolean(search || params.customerFilter)
  return (
    <ScrollableContent>
      <div className="grid gap-6 py-6">
        <PageHeader title="Customer balances">
          <PageToolbar actions={<CustomerBalanceSortMenu />}>
            <CustomerBalanceSearch />
          </PageToolbar>
          <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
        </PageHeader>
        {query.isPending ? (
          <output aria-busy="true">Loading…</output>
        ) : query.isError && !query.data ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              Couldn’t load balances. Check your connection and try again.
            </AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : rows.length && first ? (
          <>
            <CustomerAccountsList
              rows={rows}
              currencyCode={first.currencyCode}
              count={first.count ?? rows.length}
              owedMinor={first.owedMinor ?? "0"}
              onOpen={(customerId) =>
                void setDetail({ customerDetail: customerId })
              }
            />
            {query.hasNextPage ? (
              <Button
                variant="outline"
                className="w-full sm:w-fit"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </>
        ) : (
          <div className="grid justify-items-center gap-2 rounded-[var(--ui-radius-surface)] border border-dashed border-border bg-card py-12 text-center">
            <h3 className="font-medium">
              {filtered ? "Nothing matches" : "No customers yet"}
            </h3>
          </div>
        )}
      </div>
    </ScrollableContent>
  )
}
