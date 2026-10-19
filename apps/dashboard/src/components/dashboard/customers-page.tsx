"use client"

import { CollapsibleSummary } from "@/components/collapsible-summary"
import { CustomerFormSheet } from "@/components/customers/customer-form-sheet"
import { CustomerDirectoryHeader } from "@/components/dashboard/customer-directory-header"
import { MetricCard } from "@/components/reports/metric-card"
import { ScrollableContent } from "@/components/scrollable-content"
import { TableToolbarSlotProvider } from "@/components/tables/core"
import { describeCustomerBalance } from "@/components/tables/customers/columns"
import { CustomerDataTable } from "@/components/tables/customers/data-table"
import { useCustomerDirectoryParams } from "@/hooks/use-customer-directory-params"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type CustomersResponse = {
  customers: DashboardCustomerRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

const LOAD_ERROR =
  "Couldn’t load customers. Check your connection and try again."

async function fetchCustomers(search: string, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (search) params.set("search", search)
  const response = await fetch(`/api/customers?${params.toString()}`, {
    signal,
  })
  if (!response.ok) throw new Error(LOAD_ERROR)
  return ((await response.json()) as CustomersResponse).customers
}

export function CustomersPage({
  initialCustomers,
  initialQuery,
  initialSettings,
  initialViewSettings,
  canSeeBalances,
  store,
}: {
  initialCustomers: DashboardCustomerRow[]
  initialQuery: string
  initialSettings?: Partial<TableSettings>
  initialViewSettings: DirectoryViewSettings
  canSeeBalances: boolean
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
  const [form, setForm] = useState<{ customerId: string | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lastFilter = useRef(initialQuery.trim())

  useEffect(() => {
    const search = customerQuery.trim()
    if (lastFilter.current === search) return
    lastFilter.current = search
    setError(null)
    setIsLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        setCustomers(await fetchCustomers(search, controller.signal))
      } catch {
        if (!controller.signal.aborted) setError(LOAD_ERROR)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [customerQuery])

  const reload = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setCustomers(await fetchCustomers(customerQuery.trim()))
    } catch {
      setError(LOAD_ERROR)
    } finally {
      setIsLoading(false)
    }
  }, [customerQuery])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const summary = useMemo(() => {
    let orders = 0
    let ordered = 0
    let sales = BigInt(0)
    let owed = BigInt(0)
    let owing = 0
    for (const customer of customers) {
      orders += customer.orderCount
      if (customer.orderCount) ordered += 1
      sales += BigInt(customer.totalMinor)
      const balance = customer.balance
        ? describeCustomerBalance(customer.balance)
        : null
      if (balance?.kind === "owes") {
        owed += BigInt(balance.amountMinor)
        owing += 1
      }
    }
    return { orders, ordered, sales: sales.toString(), owed, owing }
  }, [customers])

  const openEdit = useCallback(
    (customerId: string) => setForm({ customerId }),
    [],
  )
  const openAdd = useCallback(() => setForm({ customerId: null }), [])

  return (
    <TableToolbarSlotProvider>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-6 pt-6">
          <CollapsibleSummary>
            <div
              data-summary-grid
              className={
                canSeeBalances
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                  : "grid gap-4 sm:grid-cols-3"
              }
            >
              <MetricCard
                label="Customers"
                value={customers.length}
                hint={
                  customers.length !== summary.ordered
                    ? `${summary.ordered} have ordered`
                    : undefined
                }
              />
              <MetricCard label="Orders" value={summary.orders} />
              <MetricCard
                label="Total sales"
                value={formatFinanceMoney(summary.sales, store.currencyCode)}
                money
              />
              {canSeeBalances ? (
                <MetricCard
                  label="Owed to you"
                  value={formatFinanceMoney(
                    summary.owed.toString(),
                    store.currencyCode,
                  )}
                  money
                  hint={
                    summary.owing
                      ? `by ${summary.owing} ${summary.owing === 1 ? "customer" : "customers"}`
                      : "Nobody owes you"
                  }
                />
              ) : null}
            </div>
          </CollapsibleSummary>

          <CustomerDirectoryHeader
            query={customerQuery}
            storeName={store.name}
            canSeeBalances={canSeeBalances}
            onSearch={(value) => void setCustomerQuery(value.trim())}
            view={view}
            onViewChange={setView}
            onAddCustomer={openAdd}
          />
          {persistenceError ? (
            <Alert appearance="dashboard" role="alert">
              <AlertDescription>Your view wasn’t saved.</AlertDescription>
              <Button variant="outline" size="sm" onClick={retryPersistence}>
                Try again
              </Button>
            </Alert>
          ) : null}

          {error ? (
            <Alert appearance="dashboard" variant="destructive" role="alert">
              <AlertDescription>
                {error}
                {customers.length ? " The list below may be out of date." : ""}
              </AlertDescription>
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                Try again
              </Button>
            </Alert>
          ) : null}
          {notice ? (
            <output
              aria-live="polite"
              className="border border-border px-4 py-3 text-sm"
            >
              {notice}
            </output>
          ) : null}

          <CustomerDataTable
            rows={customers}
            view={view}
            currencyCode={store.currencyCode}
            canSeeBalances={canSeeBalances}
            isLoading={isLoading}
            query={customerQuery}
            onClearSearch={() => void setCustomerQuery("")}
            onAddCustomer={openAdd}
            onEdit={openEdit}
            initialSettings={initialSettings}
          />
        </div>
      </ScrollableContent>
      <CustomerFormSheet
        open={Boolean(form)}
        customerId={form?.customerId ?? null}
        onOpenChange={(open) => {
          if (!open) setForm(null)
        }}
        onSaved={({ name, created }) => {
          setForm(null)
          setNotice(created ? `Added ${name}.` : `Saved ${name}’s details.`)
          void reload()
        }}
      />
    </TableToolbarSlotProvider>
  )
}
