"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type DashboardSaleRow,
  type DashboardSessionRow,
  filterSalesRows,
  formatMinorAmount,
  getPaymentLabel,
  getSaleCustomerLabel,
  getSaleProductSummary,
  getSessionVarianceMinor,
} from "@/lib/sales-operations"
import { cn } from "@/utils"
import { Badge } from "@ewatrade/ui"
import { Search01Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react"
import { useEffect, useMemo, useState } from "react"

type SalesResponse = {
  creditSales: unknown[]
  reconciliation: DashboardSessionRow[]
  sales: DashboardSaleRow[]
  sessions: DashboardSessionRow[]
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

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase()

  if (normalized === "PAID" || normalized === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700"
  }

  if (normalized === "OPEN" || normalized === "PENDING") {
    return "bg-amber-50 text-amber-700"
  }

  return "bg-muted text-muted-foreground"
}

function formatDateTime(value: string | null) {
  if (!value) return "Open"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function SalesPage({
  initialData,
  store,
}: {
  initialData: Omit<SalesResponse, "store">
  store: SalesResponse["store"]
}) {
  const [sales, setSales] = useState(initialData.sales)
  const [sessions, setSessions] = useState(initialData.sessions)
  const [reconciliation, setReconciliation] = useState(
    initialData.reconciliation,
  )
  const [creditSales, setCreditSales] = useState(initialData.creditSales)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [sessionStatus, setSessionStatus] = useState("all")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (sessionStatus !== "all") params.set("sessionStatus", sessionStatus)

        const response = await fetch(`/api/sales?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | SalesResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Sales refresh failed.",
          )
        }

        const data = result as SalesResponse
        setSales(data.sales)
        setSessions(data.sessions)
        setReconciliation(data.reconciliation)
        setCreditSales(data.creditSales)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Sales refresh failed.",
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
  }, [sessionStatus])

  const visibleSales = useMemo(
    () => filterSalesRows(sales, { search, status }),
    [sales, search, status],
  )
  const totalMinor = visibleSales.reduce(
    (sum, sale) => sum + sale.totalMinor,
    0,
  )
  const varianceMinor = reconciliation.reduce(
    (sum, session) => sum + getSessionVarianceMinor(session),
    0,
  )

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <HugeiconsIcon icon={ShoppingCart01Icon} className="size-4" />
          Sales
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sales operations
        </h1>
        <p className="text-sm text-muted-foreground">{store.name}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Sales", visibleSales.length],
          ["Revenue", formatMinorAmount(totalMinor, store.currencyCode)],
          ["Credit", creditSales.length],
          ["Sessions", sessions.length],
          ["Variance", formatMinorAmount(varianceMinor, store.currencyCode)],
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
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sales"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="lg:w-[180px]"
            aria-label="Sale status"
          >
            <option value="">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>

        <DashboardTable
          rows={visibleSales}
          isLoading={isLoading}
          getRowKey={(sale) => sale.id}
          emptyState={<p className="text-center text-sm">No sales found.</p>}
          columns={[
            {
              header: "Order",
              key: "order",
              render: (sale) => (
                <div>
                  <p className="font-medium text-foreground">
                    {sale.orderNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(sale.createdAt)}
                  </p>
                </div>
              ),
            },
            {
              header: "Customer",
              key: "customer",
              render: (sale) => getSaleCustomerLabel(sale),
            },
            {
              header: "Items",
              key: "items",
              render: (sale) => (
                <span className="text-muted-foreground">
                  {getSaleProductSummary(sale)}
                </span>
              ),
            },
            {
              header: "Payment",
              key: "payment",
              render: (sale) => getPaymentLabel(sale.payment.method),
            },
            {
              header: "Total",
              key: "total",
              render: (sale) =>
                formatMinorAmount(sale.totalMinor, sale.currencyCode),
            },
            {
              header: "Status",
              key: "status",
              render: (sale) => (
                <Badge
                  className={cn("rounded-full", statusTone(sale.paymentStatus))}
                >
                  {getPaymentLabel(sale.paymentStatus)}
                </Badge>
              ),
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Sessions and reconciliation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cashier session state, payment totals, and closeout variance.
            </p>
          </div>
          <Select
            value={sessionStatus}
            onChange={(event) => setSessionStatus(event.target.value)}
            className="md:w-[180px]"
            aria-label="Session status"
          >
            <option value="all">All sessions</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </Select>
        </div>

        <DashboardTable
          rows={sessions}
          isLoading={isLoading}
          getRowKey={(session) => session.id}
          emptyState={<p className="text-center text-sm">No sessions found.</p>}
          columns={[
            {
              header: "Cashier",
              key: "cashier",
              render: (session) => session.user.displayName,
            },
            {
              header: "Opened",
              key: "opened",
              render: (session) => formatDateTime(session.openedAt),
            },
            {
              header: "Closed",
              key: "closed",
              render: (session) => formatDateTime(session.closedAt),
            },
            {
              header: "Receipts",
              key: "receipts",
              render: (session) => session.payments.receiptCount,
            },
            {
              header: "Gross",
              key: "gross",
              render: (session) =>
                formatMinorAmount(
                  session.payments.grossMinor,
                  store.currencyCode,
                ),
            },
            {
              header: "Variance",
              key: "variance",
              render: (session) =>
                formatMinorAmount(
                  getSessionVarianceMinor(session),
                  store.currencyCode,
                ),
            },
            {
              header: "Closeout",
              key: "closeout",
              render: (session) => (
                <Badge
                  className={cn("rounded-full", statusTone(session.status))}
                >
                  {session.review?.status
                    ? getPaymentLabel(session.review.status)
                    : getPaymentLabel(session.status)}
                </Badge>
              ),
            },
          ]}
        />
      </section>
    </div>
  )
}
