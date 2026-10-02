"use client"

import { CollapsibleSummary } from "@/components/collapsible-summary"
import { CustomerDirectoryHeader } from "@/components/dashboard/customer-directory-header"
import { MetricCard } from "@/components/reports/metric-card"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerDataTable } from "@/components/tables/customers/data-table"
import { useCustomerDirectoryParams } from "@/hooks/use-customer-directory-params"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import type { TableSettings } from "@/utils/table-settings"
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
  store,
}: {
  initialCustomers: DashboardCustomerRow[]
  initialQuery: string
  initialSettings?: Partial<TableSettings>
  store: CustomersResponse["store"]
}) {
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
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Customers", customers.length],
              [
                "Orders",
                customers.reduce((sum, item) => sum + item.orderCount, 0),
              ],
              ["Revenue", formatFinanceMoney(totalMinor, store.currencyCode)],
            ].map(([label, value]) => (
              <MetricCard key={label} label={String(label)} value={value} />
            ))}
          </div>
        </CollapsibleSummary>

        <CustomerDirectoryHeader
          query={customerQuery}
          storeName={store.name}
          onSearch={onSearch}
        />

        {error ? (
          <div className="border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <CustomerDataTable
          rows={customers}
          currencyCode={store.currencyCode}
          isLoading={isLoading}
          filtered={Boolean(customerQuery.trim())}
          initialSettings={initialSettings}
        />
      </div>
    </ScrollableContent>
  )
}
