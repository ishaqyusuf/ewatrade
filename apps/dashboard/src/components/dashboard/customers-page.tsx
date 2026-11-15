"use client"

import { CustomerFormSheet } from "@/components/customers/customer-form-sheet"
import { CustomerList } from "@/components/customers/customer-list"
import { CustomerDirectoryHeader } from "@/components/dashboard/customer-directory-header"
import { ReturnablesEntry } from "@/components/returnables/returnables-page"
import {
  returnableCount,
  useReturnableBalances,
  useReturnableItems,
} from "@/components/returnables/use-returnables"
import { ScrollableContent } from "@/components/scrollable-content"
import { useCustomerDirectoryParams } from "@/hooks/use-customer-directory-params"
import { useCustomerSheetParams } from "@/hooks/use-customer-sheet-params"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { parseAsString, useQueryStates } from "nuqs"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Owed = { owingCount: number; owedMinor: string } | null
type CustomerPage = {
  customers: DashboardCustomerRow[]
  nextCursor: string | null
}

const LOAD_ERROR =
  "Couldn’t load customers. Check your connection and try again."

async function fetchCustomers(
  input: { search: string; show: string; cursor?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (input.search) params.set("search", input.search)
  if (input.show !== "all") params.set("show", input.show)
  if (input.cursor) params.set("cursor", input.cursor)
  const response = await fetch(`/api/customers?${params.toString()}`, {
    signal,
  })
  if (!response.ok) throw new Error(LOAD_ERROR)
  return (await response.json()) as CustomerPage & { owed: Owed }
}

/**
 * The customer book, 50 at a time from the server. Search and the balance
 * filter run in SQL (one request after a pause in typing), Load more reads
 * the next page, and "Owed to you" comes from one aggregate, not the rows.
 * A row opens the customer's details sheet.
 */
export function CustomersPage({
  initialPage,
  initialOwed,
  initialKey,
  canSeeBalances,
  store,
}: {
  initialPage: CustomerPage
  initialOwed: Owed
  /** The search and filter the server page was read with. */
  initialKey: string
  canSeeBalances: boolean
  store: { currencyCode: string; id: string; name: string }
}) {
  const { customerQuery, setCustomerQuery, customerFilter, setCustomerFilter } =
    useCustomerDirectoryParams()
  const [customers, setCustomers] = useState(initialPage.customers)
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [owed, setOwed] = useState(initialOwed)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
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

  const show = canSeeBalances ? customerFilter : "all"
  const search = customerQuery.trim()
  const key = `${search}:${show}`
  const lastKey = useRef(initialKey)

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      setError(null)
      setLoading(true)
      try {
        const page = await fetchCustomers({ search, show }, signal)
        setCustomers(page.customers)
        setNextCursor(page.nextCursor)
        if (page.owed) setOwed(page.owed)
      } catch {
        if (!signal?.aborted) setError(LOAD_ERROR)
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [search, show],
  )

  // A new search or filter reads the first page again after a short pause.
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const controller = new AbortController()
    const timer = setTimeout(() => void reload(controller.signal), 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, reload])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchCustomers({ search, show, cursor: nextCursor })
      setCustomers((current) => [...current, ...page.customers])
      setNextCursor(page.nextCursor)
    } catch {
      setError(LOAD_ERROR)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

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

  const filtered = Boolean(search) || show !== "all"

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
                      {formatFinanceMoney(
                        owed?.owedMinor ?? "0",
                        store.currencyCode,
                      )}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {owed?.owingCount
                          ? `${owed.owingCount} ${owed.owingCount === 1 ? "customer" : "customers"}`
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

          {customers.length ? (
            <div
              aria-busy={loading}
              className={loading ? "opacity-60 transition-opacity" : undefined}
            >
              <CustomerList
                rows={customers}
                currencyCode={store.currencyCode}
                canSeeBalances={canSeeBalances}
                returnablesOut={returnablesOut}
                onOpen={(customerId) =>
                  void setDetail({ customerDetail: customerId })
                }
                loadingMore={loadingMore}
                onLoadMore={nextCursor ? () => void loadMore() : undefined}
              />
            </div>
          ) : loading ? (
            <output aria-busy="true" className="text-sm text-muted-foreground">
              Loading…
            </output>
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
