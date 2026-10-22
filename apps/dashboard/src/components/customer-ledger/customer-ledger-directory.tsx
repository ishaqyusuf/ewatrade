"use client"
import { financeViewOptions } from "@/components/finance/finance-directory-view"
import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { SecondaryMenu } from "@/components/secondary-menu"
import { CustomerAccountsDataTable } from "@/components/tables/customer-accounts/data-table"
import { ViewDropdown } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  CustomerBalanceSearch,
  CustomerBalanceSortMenu,
  useCustomerBalanceParams,
} from "./customer-balances-controls"

/** Finance pages workshop 01: what each saved Customer owes you. */
export function CustomerLedgerDirectory({
  initialViewSettings,
}: {
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "customer-accounts",
      queryKey: "accountView",
      initialSettings: initialViewSettings,
    })
  const trpc = useTRPC()
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
        <PageHeader
          eyebrow="Business money"
          title="Customer balances"
          description="What each saved Customer owes you."
        >
          <PageToolbar
            actions={
              <>
                <CustomerBalanceSortMenu />
                <ViewDropdown
                  label="Customer balances view"
                  value={view}
                  options={financeViewOptions}
                  onValueChange={setView}
                />
              </>
            }
          >
            <CustomerBalanceSearch />
          </PageToolbar>
          <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
        </PageHeader>
        {persistenceError ? (
          <Alert appearance="dashboard" role="alert">
            <AlertDescription>{persistenceError}</AlertDescription>
            <Button variant="outline" size="sm" onClick={retryPersistence}>
              Retry saving view
            </Button>
          </Alert>
        ) : null}
        {query.isPending ? (
          <output aria-busy="true">Loading Customers…</output>
        ) : query.isError && !query.data ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              We couldn&apos;t load Customers. Check your connection and try
              again.
            </AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : rows.length && first ? (
          <>
            <CustomerAccountsDataTable
              rows={rows}
              view={view}
              search={`${search}:${params.customerFilter ?? ""}:${params.customerSort}`}
              currencyCode={first.currencyCode}
              count={first.count}
              owedMinor={first.owedMinor}
            />
            {query.hasNextPage ? (
              <Button
                variant="outline"
                className="w-fit"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </>
        ) : (
          <div className="grid justify-items-center gap-2 border-y border-border py-16 text-center">
            <h3 className="font-medium">
              {filtered ? "Nothing matches" : "No Customers yet"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {filtered
                ? "Change the search or filter to see more."
                : "Customers appear here once you save them in Customers."}
            </p>
          </div>
        )}
      </div>
    </ScrollableContent>
  )
}
