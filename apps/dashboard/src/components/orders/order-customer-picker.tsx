"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { ControlField, Input } from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"

export type OrderCustomerSelection = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export function OrderCustomerPicker({
  selected,
  onSelect,
}: {
  selected: OrderCustomerSelection | null
  onSelect: (customer: OrderCustomerSelection | null) => void
}) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const query = useDeferredValue(search.trim())
  const customers = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      { limit: 20, query: query || undefined },
      {
        enabled: !selected,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  )
  if (selected)
    return (
      <div className="flex items-center justify-between gap-3 border border-border p-3">
        <div>
          <p className="text-sm font-medium">{selected.name}</p>
          <p className="text-xs text-muted-foreground">
            Saved customer ·{" "}
            {[selected.phone, selected.email].filter(Boolean).join(" · ") ||
              selected.id}
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-primary"
          onClick={() => onSelect(null)}
        >
          Change customer
        </button>
      </div>
    )
  const rows =
    query === search.trim()
      ? (customers.data?.pages.flatMap((page) => page.items) ?? [])
      : []
  return (
    <div className="grid gap-2">
      <ControlField label={<>Find a saved customer</>}>
        <Input
          value={search}
          maxLength={160}
          placeholder="Search by name, phone or email"
          onChange={(event) => setSearch(event.target.value)}
        />
      </ControlField>
      <p className="text-xs text-muted-foreground">
        Select a saved customer to link this order, or enter contact details
        below.
      </p>
      {customers.isError ? (
        <FormFeedback appearance="dashboard">
          Could not load customers.{" "}
          <button type="button" onClick={() => void customers.refetch()}>
            Retry
          </button>
        </FormFeedback>
      ) : null}
      {customers.isPending || query !== search.trim() ? (
        <output className="text-sm text-muted-foreground">
          Loading customers…
        </output>
      ) : null}
      <div className="max-h-48 overflow-y-auto border border-border">
        {rows.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted focus-visible:bg-muted"
          >
            <span className="block font-medium">{customer.name}</span>
            <span className="block text-xs text-muted-foreground">
              {[customer.phone, customer.email].filter(Boolean).join(" · ") ||
                `Customer ${customer.id}`}
            </span>
          </button>
        ))}
      </div>
      {!customers.isPending &&
      !customers.isError &&
      !rows.length &&
      query === search.trim() ? (
        <p className="text-sm text-muted-foreground">
          No saved customers found.
        </p>
      ) : null}
      {customers.hasNextPage ? (
        <button
          type="button"
          className="text-sm text-primary"
          disabled={customers.isFetchingNextPage}
          onClick={() => void customers.fetchNextPage()}
        >
          {customers.isFetchingNextPage ? "Loading…" : "Load more customers"}
        </button>
      ) : null}
    </div>
  )
}
