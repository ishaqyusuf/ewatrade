"use client"
import { useTRPC } from "@/trpc/client"
import { Button, Input } from "@ewatrade/ui"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"

export function GeneralSaleCustomer({
  customerId,
  disabled,
  onChange,
}: {
  customerId?: string
  disabled: boolean
  onChange: (id: string | undefined) => void
}) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const query = useDeferredValue(search.trim())
  const selected = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: customerId ?? "" },
      { enabled: !!customerId, retry: false },
    ),
  )
  const matches = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      { query: query || undefined, limit: 10 },
      {
        enabled: !!query && !customerId,
        retry: false,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  )
  if (customerId)
    return (
      <div className="grid gap-2 border border-border p-3">
        <p className="text-sm">
          {selected.data?.name ??
            (selected.isError ? "Customer unavailable" : "Loading customer…")}
        </p>
        {selected.data ? (
          <p className="text-xs text-muted-foreground">
            {[selected.data.phone, selected.data.email]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setSearch("")
            onChange(undefined)
          }}
        >
          Change customer / use walk-in
        </Button>
      </div>
    )
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        Walk-in customer. Search to choose a saved customer.
      </p>
      <Input
        aria-label="Search saved customers"
        placeholder="Name, phone or email"
        value={search}
        maxLength={160}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
      />
      {query ? (
        matches.isError ? (
          <p role="alert" className="text-sm">
            Customer search unavailable.{" "}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void matches.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : matches.isFetching || query !== search.trim() ? (
          <p className="text-sm">Searching…</p>
        ) : (
          <>
            {matches.data?.pages
              .flatMap((page) => page.items)
              .map((customer) => (
                <Button
                  key={customer.id}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  className="h-auto justify-start whitespace-normal text-left"
                  onClick={() => onChange(customer.id)}
                >
                  {[customer.name, customer.phone, customer.email]
                    .filter(Boolean)
                    .join(" · ")}
                </Button>
              ))}
            {!matches.data?.pages.some((page) => page.items.length) ? (
              <p className="text-sm">No saved customers found.</p>
            ) : null}
            {matches.hasNextPage ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => void matches.fetchNextPage()}
              >
                More customers
              </Button>
            ) : null}
          </>
        )
      ) : null}
    </div>
  )
}
