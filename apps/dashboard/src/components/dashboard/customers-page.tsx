"use client"

import { CollapsibleSummary } from "@/components/collapsible-summary"
import { CustomerDirectoryHeader } from "@/components/dashboard/customer-directory-header"
import { MetricCard } from "@/components/reports/metric-card"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerDataTable } from "@/components/tables/customers/data-table"
import { useCustomerDirectoryParams } from "@/hooks/use-customer-directory-params"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useEffect, useMemo, useRef, useState } from "react"

type CustomersResponse = {
  customers: DashboardCustomerRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

export function CustomersPage({
  initialCustomers,
  initialQuery,
  initialSettings,
  initialViewSettings,
  store,
}: {
  initialCustomers: DashboardCustomerRow[]
  initialQuery: string
  initialSettings?: Partial<TableSettings>
  initialViewSettings: DirectoryViewSettings
  store: CustomersResponse["store"]
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "customers",
      queryKey: "customerView",
      initialSettings: initialViewSettings,
    })
  const { customerQuery, setCustomerQuery } = useCustomerDirectoryParams()
  const [customers, setCustomers] = useState(initialCustomers)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFilter = useRef(initialQuery.trim())

  useEffect(() => {
    const search = customerQuery.trim()
    if (lastFilter.current === search) return
    lastFilter.current = search
    setError(null)
    setIsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (search) params.set("search", search)

        const response = await fetch(`/api/customers?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | CustomersResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Customer refresh failed.",
          )
        }

        setCustomers((result as CustomersResponse).customers)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Customer refresh failed.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [customerQuery])

  const totalMinor = useMemo(
    () =>
      customers
        .reduce((sum, customer) => sum + BigInt(customer.totalMinor), 0n)
        .toString(),
    [customers],
  )

  function onSearch(value: string) {
    void setCustomerQuery(value.trim())
  }

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
        <CollapsibleSummary>
          <div data-summary-grid className="grid gap-4 sm:grid-cols-3">
            {[
              ["Customers", customers.length],
              [
                "Orders",
                customers.reduce((sum, item) => sum + item.orderCount, 0),
              ],
              ["Revenue", formatFinanceMoney(totalMinor, store.currencyCode)],
            ].map(([label, value]) => (
              <MetricCard
                key={label}
                label={String(label)}
                value={value}
                money={label === "Revenue"}
              />
            ))}
          </div>
        </CollapsibleSummary>

        <CustomerDirectoryHeader
          query={customerQuery}
          storeName={store.name}
          onSearch={onSearch}
          view={view}
          onViewChange={setView}
        />
        {persistenceError ? (
          <Alert appearance="dashboard" role="alert">
            <AlertDescription>{persistenceError}</AlertDescription>
            <Button variant="outline" size="sm" onClick={retryPersistence}>
              Retry saving view
            </Button>
          </Alert>
        ) : null}

        {error ? (
          <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <CustomerDataTable
          rows={customers}
          view={view}
          currencyCode={store.currencyCode}
          isLoading={isLoading}
          filtered={Boolean(customerQuery.trim())}
          selectionScope={customerQuery.trim()}
          initialSettings={initialSettings}
        />
      </div>
    </ScrollableContent>
  )
}
