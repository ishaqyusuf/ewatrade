"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"
import {
  type OrderCustomerSelection,
  orderCustomerContacts,
} from "./order-customer-search"

export type { OrderCustomerSelection } from "./order-customer-search"

type Choice = {
  key: string
  label: string
  customer?: OrderCustomerSelection
  createSearch?: string
}

export function OrderCustomerPicker({
  selected,
  initialSearch = "",
  customerDirectory,
  storeId,
  disabled,
  onSelect,
  onCreate,
}: {
  selected: OrderCustomerSelection | null
  initialSearch?: string
  customerDirectory: boolean
  storeId: string
  disabled?: boolean
  onSelect: (customer: OrderCustomerSelection | null) => void
  onCreate: (search: string) => void
}) {
  const trpc = useTRPC()
  const [search, setSearch] = useState(initialSearch)
  const query = useDeferredValue(search.trim())
  const enabled = !selected && Boolean(query)
  const directory = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      { limit: 20, query: query || undefined },
      {
        enabled: enabled && customerDirectory,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const history = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      { limit: 20, query: query || undefined, queryMode: "customer", storeId },
      {
        enabled: enabled && !customerDirectory,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const active = customerDirectory ? directory : history
  const settled =
    query === search.trim() && active.isSuccess && !active.isFetching
  const customers: OrderCustomerSelection[] = customerDirectory
    ? (directory.data?.pages.flatMap((page) => page.items) ?? [])
    : orderCustomerContacts(
        history.data?.pages.flatMap((page) => page.items) ?? [],
      )
  const choices: Choice[] = settled
    ? customers.map((customer) => ({
        key:
          customer.id ??
          JSON.stringify([customer.name, customer.phone, customer.email]),
        label: [customer.name, customer.phone, customer.email]
          .filter(Boolean)
          .join(" · "),
        customer,
      }))
    : []
  if (enabled && settled && !choices.length && !active.hasNextPage)
    choices.push({
      key: "create",
      label: `Create customer “${query}”`,
      createSearch: query,
    })

  if (selected)
    return (
      <div className="flex items-center justify-between gap-3 border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {selected.name || selected.phone}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            {[selected.phone, selected.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setSearch("")
            onSelect(null)
          }}
        >
          Change customer
        </Button>
      </div>
    )

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Combobox<Choice>
          items={choices}
          value={null}
          filter={null}
          itemToStringLabel={(choice) => choice.label}
          inputValue={search}
          onInputValueChange={setSearch}
          autoHighlight
          disabled={disabled}
          onValueChange={(choice) => {
            if (choice?.customer) onSelect(choice.customer)
            else if (choice?.createSearch) onCreate(choice.createSearch)
          }}
        >
          <ComboboxInput
            disabled={disabled}
            aria-label="Search customers"
            placeholder="Customer name or phone number"
            maxLength={160}
            className="w-full"
          />
          <ComboboxContent>
            <ComboboxEmpty>
              {!query
                ? "Type a name or phone number."
                : active.isError
                  ? "Could not load customers. Try again."
                  : !settled
                    ? "Searching customers…"
                    : "No matching customers."}
            </ComboboxEmpty>
            <ComboboxList>
              {(choice: Choice) => (
                <ComboboxItem key={choice.key} value={choice}>
                  {choice.customer ? (
                    <span className="flex min-w-0 flex-col gap-1">
                      <span>
                        {choice.customer.name || choice.customer.phone}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {[choice.customer.phone, choice.customer.email]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  ) : (
                    choice.label
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Create customer"
          title="Create customer"
          disabled={disabled}
          onClick={() => onCreate(search)}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </Button>
      </div>
      {active.isError ? (
        <FormFeedback appearance="dashboard">
          Could not load customers.{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void active.refetch()}
          >
            Retry
          </Button>
        </FormFeedback>
      ) : null}
      {enabled && settled && active.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          disabled={active.isFetchingNextPage}
          onClick={() => void active.fetchNextPage()}
        >
          Load more customers
        </Button>
      ) : null}
    </div>
  )
}
