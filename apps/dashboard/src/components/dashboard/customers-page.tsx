"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type DashboardCustomerRow,
  formatMinorAmount,
} from "@/lib/sales-operations"
import { cn } from "@/utils"
import { Search01Icon, UserCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { InputHTMLAttributes } from "react"
import { useEffect, useMemo, useState } from "react"

type CustomersResponse = {
  customers: DashboardCustomerRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(date)
}

export function CustomersPage({
  initialCustomers,
  store,
}: {
  initialCustomers: DashboardCustomerRow[]
  store: CustomersResponse["store"]
}) {
  const [customers, setCustomers] = useState(initialCustomers)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("search", search.trim())

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
  }, [search])

  const totalMinor = useMemo(
    () => customers.reduce((sum, customer) => sum + customer.totalMinor, 0),
    [customers],
  )

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <HugeiconsIcon icon={UserCircle02Icon} className="size-4" />
          Customers
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Customer book</h1>
        <p className="text-sm text-muted-foreground">{store.name}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Customers", customers.length],
          ["Orders", customers.reduce((sum, item) => sum + item.orderCount, 0)],
          ["Revenue", formatMinorAmount(totalMinor, store.currencyCode)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex rounded-lg border border-border bg-background p-4">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customers"
              className="pl-9"
            />
          </div>
        </div>

        <DashboardTable
          rows={customers}
          isLoading={isLoading}
          getRowKey={(customer) => customer.id}
          emptyState={
            <p className="text-center text-sm">No customers found.</p>
          }
          columns={[
            {
              header: "Customer",
              key: "customer",
              render: (customer) => (
                <div>
                  <p className="font-medium text-foreground">{customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {customer.phone ?? customer.email ?? customer.identityType}
                  </p>
                </div>
              ),
            },
            {
              header: "Orders",
              key: "orders",
              render: (customer) => customer.orderCount,
            },
            {
              header: "Total",
              key: "total",
              render: (customer) =>
                formatMinorAmount(customer.totalMinor, store.currencyCode),
            },
            {
              header: "Last order",
              key: "lastOrder",
              render: (customer) => customer.lastOrder.orderNumber,
            },
            {
              header: "Last seen",
              key: "lastSeen",
              render: (customer) => (
                <span className="text-muted-foreground">
                  {formatDate(customer.lastSeenAt)}
                </span>
              ),
            },
          ]}
        />
      </section>
    </div>
  )
}
