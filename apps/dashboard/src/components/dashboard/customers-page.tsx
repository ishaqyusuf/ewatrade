"use client"

import { CustomerFormSheet } from "@/components/customers/customer-form-sheet"
import {
  CustomerList,
  filterCustomers,
} from "@/components/customers/customer-list"
import { CustomerDirectoryHeader } from "@/components/dashboard/customer-directory-header"
import { ReturnablesEntry } from "@/components/returnables/returnables-page"
import {
  returnableCount,
  useReturnableBalances,
  useReturnableItems,
} from "@/components/returnables/use-returnables"
import { ScrollableContent } from "@/components/scrollable-content"
import { describeCustomerBalance } from "@/components/tables/customers/columns"
import { useCustomerDirectoryParams } from "@/hooks/use-customer-directory-params"
import { useCustomerSheetParams } from "@/hooks/use-customer-sheet-params"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { parseAsString, useQueryStates } from "nuqs"
import { useCallback, useEffect, useMemo, useState } from "react"

type CustomersResponse = {
  customers: DashboardCustomerRow[]
}

const LOAD_ERROR =
  "Couldn’t load customers. Check your connection and try again."

async function fetchCustomers() {
  const response = await fetch("/api/customers")
  if (!response.ok) throw new Error(LOAD_ERROR)
  return ((await response.json()) as CustomersResponse).customers
}

/**
 * The customer book: search and filter happen on the device over the loaded
 * book (no request per letter); a row opens the customer's details sheet.
 */
export function CustomersPage({
  initialCustomers,
  canSeeBalances,
  store,
}: {
  initialCustomers: DashboardCustomerRow[]
  canSeeBalances: boolean
  store: { currencyCode: string; id: string; name: string }
}) {
  const { customerQuery, setCustomerQuery, customerFilter, setCustomerFilter } =
    useCustomerDirectoryParams()
  const [customers, setCustomers] = useState(initialCustomers)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { openCreate } = useCustomerSheetParams()
  const [, setDetail] = useQueryStates(
    { customerDetail: parseAsString },
    { history: "push" },
  )
  // Same reads as the Returnables card above, so no extra request.
  const returnableItems = useReturnableItems()
  const returnables = useReturnableBalances({
    enabled: Boolean(returnableItems.data?.length),
  })

  const reload = useCallback(async () => {
    setError(null)
    try {
      setCustomers(await fetchCustomers())
    } catch {
      setError(LOAD_ERROR)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const owed = useMemo(() => {
    let total = BigInt(0)
    let count = 0
    for (const customer of customers) {
      const view = customer.balance
        ? describeCustomerBalance(customer.balance)
        : null
      if (view?.kind !== "owes") continue
      total += BigInt(view.amountMinor)
      count += 1
    }
    return { total: total.toString(), count }
  }, [customers])

  const returnablesOut = useMemo(() => {
    const byCustomer = new Map<string, string[]>()
    for (const row of returnables.data ?? []) {
      if (!row.out) continue
      const list = byCustomer.get(row.customerId) ?? []
      list.push(`${returnableCount(row.out, row.itemName)} out`)
      byCustomer.set(row.customerId, list)
    }
    return new Map(
      [...byCustomer].map(([id, parts]) => [id, parts.join(", ")] as const),
    )
  }, [returnables.data])

  const rows = useMemo(
    () =>
      filterCustomers(
        customers,
        customerQuery,
        canSeeBalances ? customerFilter : "all",
      ),
    [customers, customerQuery, customerFilter, canSeeBalances],
  )
  const filtered = Boolean(customerQuery.trim()) || customerFilter !== "all"

  return (
    <>
      <ScrollableContent>
        <div className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pb-24 sm:pb-10">
          {canSeeBalances || returnableItems.data?.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {canSeeBalances ? (
                <Link
                  href="/customer-ledger?customerFilter=owe"
                  className="flex min-h-14 items-center gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-2.5 transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted-foreground">
                      Owed to you
                    </span>
                    <span className="block text-lg font-semibold tabular-nums">
                      {formatFinanceMoney(owed.total, store.currencyCode)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {owed.count
                          ? `${owed.count} ${owed.count === 1 ? "customer" : "customers"}`
                          : "Nobody owes you"}
                      </span>
                    </span>
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-4 text-muted-foreground"
                  />
                </Link>
              ) : null}
              <ReturnablesEntry />
            </div>
          ) : null}

          <CustomerDirectoryHeader
            query={customerQuery}
            canSeeBalances={canSeeBalances}
            onSearch={(value) => void setCustomerQuery(value.trim())}
            filter={customerFilter}
            onFilterChange={(next) => void setCustomerFilter(next)}
            onAddCustomer={() => void openCreate()}
          />

          {error ? (
            <Alert appearance="dashboard" variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
              <Button variant="outline" onClick={() => void reload()}>
                Try again
              </Button>
            </Alert>
          ) : null}
          {notice ? (
            <output
              aria-live="polite"
              className="rounded-[var(--ui-radius-item)] border border-border bg-card px-4 py-3 text-sm"
            >
              {notice}
            </output>
          ) : null}

          {rows.length ? (
            <CustomerList
              key={`${customerQuery}:${customerFilter}`}
              rows={rows}
              currencyCode={store.currencyCode}
              canSeeBalances={canSeeBalances}
              returnablesOut={returnablesOut}
              onOpen={(customerId) =>
                void setDetail({ customerDetail: customerId })
              }
            />
          ) : (
            <div className="grid justify-items-center gap-3 rounded-[var(--ui-radius-surface)] border border-dashed border-border bg-card px-4 py-12 text-center">
              <p className="font-medium">
                {filtered ? "No customers match" : "No customers yet"}
              </p>
              {filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    void setCustomerQuery("")
                    void setCustomerFilter("all")
                  }}
                >
                  Show all
                </Button>
              ) : (
                <Button onClick={() => void openCreate()}>Add customer</Button>
              )}
            </div>
          )}
        </div>
      </ScrollableContent>
      <CustomerFormSheet
        canAddStartingBalance={canSeeBalances}
        onSaved={({ name, created }) => {
          setNotice(created ? `Added ${name}.` : `Saved ${name}.`)
          void reload()
        }}
      />
    </>
  )
}
