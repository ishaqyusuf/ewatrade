"use client"
import { financeViewOptions } from "@/components/finance/finance-directory-view"
import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { SearchField } from "@/components/search-field"
import { SecondaryMenu } from "@/components/secondary-menu"
import { CustomerAccountsDataTable } from "@/components/tables/customer-accounts/data-table"
import { ViewDropdown } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { useMemo } from "react"

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
  const [params, setParams] = useQueryStates(
    {
      customerSearch: parseAsString.withDefault(""),
      customerCursor: parseAsString,
    },
    { history: "push" },
  )
  const search = params.customerSearch.trim()
  const query = useQuery(
    trpc.customers.listPage.queryOptions(
      {
        query: search || undefined,
        cursor: params.customerCursor ?? undefined,
        limit: 30,
      },
      { retry: false },
    ),
  )
  const customerIds = query.data?.items.map((customer) => customer.id) ?? []
  const balances = useQuery(
    trpc.finance.customerBalances.queryOptions(
      { customerIds },
      { enabled: customerIds.length > 0, retry: false },
    ),
  )
  const rows = useMemo(() => {
    const byCustomer = new Map(
      (balances.data?.items ?? []).map((item) => [item.customerId, item]),
    )
    const loaded = balances.isSuccess
    return (query.data?.items ?? []).map((customer) => ({
      ...customer,
      owedMinor: loaded
        ? (byCustomer.get(customer.id)?.owedMinor ?? "0")
        : undefined,
      paidAheadMinor: loaded
        ? (byCustomer.get(customer.id)?.paidAheadMinor ?? "0")
        : undefined,
    }))
  }, [query.data, balances.data, balances.isSuccess])
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
              <ViewDropdown
                label="Customer balances view"
                value={view}
                options={financeViewOptions}
                onValueChange={setView}
              />
            }
          >
            <SearchField
              placeholder="Search Customers..."
              value={params.customerSearch}
              onSearch={(value) =>
                void setParams({ customerSearch: value, customerCursor: null })
              }
              onClear={() =>
                void setParams({ customerSearch: "", customerCursor: null })
              }
            />
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
        {balances.isError ? (
          <Alert appearance="dashboard" role="alert">
            <AlertDescription>
              Balances couldn&apos;t load. Names are still shown.
            </AlertDescription>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void balances.refetch()}
            >
              Try again
            </Button>
          </Alert>
        ) : null}
        {query.isPending ? (
          <output aria-busy="true">Loading Customers…</output>
        ) : query.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              We couldn&apos;t load Customers. Check your connection and try
              again.
            </AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : (
          <>
            {rows.length ? (
              <CustomerAccountsDataTable
                rows={rows}
                view={view}
                search={params.customerSearch}
                currencyCode={balances.data?.currencyCode ?? "NGN"}
              />
            ) : (
              <div className="grid justify-items-center gap-2 border-y border-border py-16 text-center">
                <h3 className="font-medium">
                  {search ? "Nothing matches" : "No Customers yet"}
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {search
                    ? "Change the search to see more."
                    : "Customers appear here once you save them in Customers."}
                </p>
              </div>
            )}
            {params.customerCursor || query.data.nextCursor ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!params.customerCursor || query.isFetching}
                  onClick={() => void setParams({ customerCursor: null })}
                >
                  First page
                </Button>
                <Button
                  variant="outline"
                  disabled={!query.data.nextCursor || query.isFetching}
                  onClick={() =>
                    void setParams({
                      customerCursor: query.data.nextCursor ?? null,
                    })
                  }
                >
                  Next page
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
