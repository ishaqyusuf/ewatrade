"use client"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerAccountsDataTable } from "@/components/tables/customer-accounts/data-table"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  Input,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
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
  const query = useQuery(
    trpc.customers.listPage.queryOptions(
      {
        query: params.customerSearch.trim() || undefined,
        cursor: params.customerCursor ?? undefined,
        limit: 30,
      },
      { retry: false },
    ),
  )
  return (
    <ScrollableContent>
      <div className="grid gap-6 py-6">
        <PageHeader
          title="Customer accounts"
          description="Saved customers only. Historical contacts are not inferred as account owners."
        >
          <PageToolbar
            actions={
              <ViewSwitcher
                label="Customer account view"
                value={view}
                options={directoryViewOptions}
                onValueChange={setView}
              />
            }
          >
            <ControlField label="Find a saved customer">
              <Input
                value={params.customerSearch}
                onChange={(e) =>
                  void setParams({
                    customerSearch: e.target.value,
                    customerCursor: null,
                  })
                }
              />
            </ControlField>
          </PageToolbar>
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
          <output aria-busy="true">Loading saved customers…</output>
        ) : query.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{query.error.message}</AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : (
          <>
            {query.data.items.length ? (
              <CustomerAccountsDataTable
                rows={query.data.items}
                view={view}
                search={params.customerSearch}
              />
            ) : null}
            {!query.data.items.length ? (
              <p>No saved customers match this search.</p>
            ) : null}
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
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
