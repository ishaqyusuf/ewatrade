"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type DashboardDeliveryRequest,
  type DashboardProductShareLink,
  type DashboardShareableProduct,
  type DashboardSharedLinkOrderRequest,
  filterShareLinks,
  filterSharedOrders,
  formatShareLinkAmount,
  formatShareLinkLabel,
  getShareLinkCustomerLabel,
  getSharedOrderProductLabel,
} from "@/lib/share-links-operations"
import { cn } from "@/utils"
import { Badge, Button } from "@ewatrade/ui"
import { Add01Icon, Link01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react"
import { useEffect, useMemo, useState } from "react"

type LinksResponse = {
  deliveries: DashboardDeliveryRequest[]
  links: DashboardProductShareLink[]
  orders: DashboardSharedLinkOrderRequest[]
  products: DashboardShareableProduct[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

type OperationResponse = {
  error?: string
  result?: unknown
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

function Field({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase()

  if (
    normalized === "ACTIVE" ||
    normalized === "COMPLETED" ||
    normalized === "PAID" ||
    normalized === "DELIVERED"
  ) {
    return "bg-emerald-50 text-emerald-700"
  }

  if (
    normalized === "PENDING" ||
    normalized === "RESERVED" ||
    normalized === "OPEN" ||
    normalized === "READY_FOR_PICKUP"
  ) {
    return "bg-amber-50 text-amber-700"
  }

  if (normalized === "CANCELLED" || normalized === "FAILED") {
    return "bg-destructive/10 text-destructive"
  }

  return "bg-muted text-muted-foreground"
}

function formatDateTime(value: string | null) {
  if (!value) return "None"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function LinksPage({
  initialData,
  store,
}: {
  initialData: Omit<LinksResponse, "store">
  store: LinksResponse["store"]
}) {
  const [links, setLinks] = useState(initialData.links)
  const [orders, setOrders] = useState(initialData.orders)
  const [deliveries, setDeliveries] = useState(initialData.deliveries)
  const [products] = useState(initialData.products)
  const [linkSearch, setLinkSearch] = useState("")
  const [linkStatus, setLinkStatus] = useState("")
  const [orderSearch, setOrderSearch] = useState("")
  const [orderStatus, setOrderStatus] = useState("pending")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? "",
  )
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refresh(nextOrderStatus = orderStatus) {
    const params = new URLSearchParams()
    if (nextOrderStatus) params.set("orderStatus", nextOrderStatus)

    const response = await fetch(`/api/links?${params.toString()}`)
    const result = (await response.json()) as LinksResponse | { error?: string }

    if (!response.ok) {
      throw new Error(
        "error" in result && result.error
          ? result.error
          : "Generated links refresh failed.",
      )
    }

    const data = result as LinksResponse
    setLinks(data.links)
    setOrders(data.orders)
    setDeliveries(data.deliveries)
  }

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        params.set("orderStatus", orderStatus)

        const response = await fetch(`/api/links?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | LinksResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Generated links refresh failed.",
          )
        }

        const data = result as LinksResponse
        setLinks(data.links)
        setOrders(data.orders)
        setDeliveries(data.deliveries)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Generated links refresh failed.",
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
  }, [orderStatus])

  const visibleLinks = useMemo(
    () => filterShareLinks(links, { search: linkSearch, status: linkStatus }),
    [links, linkSearch, linkStatus],
  )
  const visibleOrders = useMemo(
    () => filterSharedOrders(orders, { search: orderSearch, status: "" }),
    [orders, orderSearch],
  )
  const deliveryByOrderId = useMemo(
    () => new Map(deliveries.map((delivery) => [delivery.order.id, delivery])),
    [deliveries],
  )
  const activeCount = links.filter((link) => link.active).length
  const orderTotalMinor = visibleOrders.reduce(
    (total, order) => total + order.totalMinor,
    0,
  )

  async function submitCreateLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch("/api/links", {
        body: JSON.stringify({
          label: label.trim() || undefined,
          operation: "create_link",
          productId: selectedProductId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as OperationResponse

      if (!response.ok) {
        throw new Error(result.error ?? "Link creation failed.")
      }

      await refresh()
      setNotice("Generated link created.")
      setIsCreateOpen(false)
      setLabel("")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Link creation failed.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function runOperation(
    payload: Record<string, unknown>,
    message: string,
  ) {
    setIsSaving(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch("/api/links", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as OperationResponse

      if (!response.ok) {
        throw new Error(result.error ?? "Operation failed.")
      }

      await refresh()
      setNotice(message)
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "Operation failed.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
            Generated links
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Product links and follow-up
          </h1>
          <p className="text-sm text-muted-foreground">{store.name}</p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
          Create link
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Links", links.length],
          ["Active", activeCount],
          ["Views", links.reduce((sum, link) => sum + link.viewCount, 0)],
          ["Orders", orders.length],
          ["Value", formatShareLinkAmount(orderTotalMinor, store.currencyCode)],
        ].map(([labelText, value]) => (
          <div
            key={labelText}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {labelText}
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
              value={linkSearch}
              onChange={(event) => setLinkSearch(event.target.value)}
              placeholder="Search generated links"
              className="pl-9"
            />
          </div>
          <Select
            value={linkStatus}
            onChange={(event) => setLinkStatus(event.target.value)}
            className="lg:w-[180px]"
            aria-label="Link status"
          >
            <option value="">All links</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>

        <DashboardTable
          rows={visibleLinks}
          isLoading={isLoading}
          getRowKey={(link) => link.id}
          emptyState={<p className="text-center text-sm">No links found.</p>}
          columns={[
            {
              header: "Product",
              key: "product",
              render: (link) => (
                <div>
                  <p className="font-medium text-foreground">
                    {link.product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {link.label ?? link.product.slug}
                  </p>
                </div>
              ),
            },
            {
              header: "Activity",
              key: "activity",
              render: (link) => (
                <span className="text-muted-foreground">
                  {link.viewCount} views / {link.orderCount} orders
                </span>
              ),
            },
            {
              header: "Last activity",
              key: "lastActivity",
              render: (link) => formatDateTime(link.lastActivityAt),
            },
            {
              header: "Status",
              key: "status",
              render: (link) => (
                <Badge
                  className={cn(
                    "rounded-full",
                    statusTone(link.active ? "active" : "inactive"),
                  )}
                >
                  {link.active ? "Active" : "Inactive"}
                </Badge>
              ),
            },
            {
              header: "Actions",
              key: "actions",
              render: (link) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigator.clipboard?.writeText(link.url)}
                  >
                    Copy
                  </Button>
                  {link.active ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() =>
                        runOperation(
                          {
                            operation: "deactivate_link",
                            productId: link.product.id,
                            shareLinkId: link.id,
                          },
                          "Generated link deactivated.",
                        )
                      }
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Shared-link order requests
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer requests, reservations, notifications, and delivery
              state.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <TextInput
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
              placeholder="Search orders"
            />
            <Select
              value={orderStatus}
              onChange={(event) => setOrderStatus(event.target.value)}
              className="sm:w-[180px]"
              aria-label="Order status"
            >
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All orders</option>
            </Select>
          </div>
        </div>

        <DashboardTable
          rows={visibleOrders}
          isLoading={isLoading}
          getRowKey={(order) => order.id}
          emptyState={
            <p className="text-center text-sm">No shared-link orders found.</p>
          }
          columns={[
            {
              header: "Order",
              key: "order",
              render: (order) => (
                <div>
                  <p className="font-medium text-foreground">
                    {order.orderNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
              ),
            },
            {
              header: "Customer",
              key: "customer",
              render: (order) => getShareLinkCustomerLabel(order),
            },
            {
              header: "Product",
              key: "product",
              render: (order) => getSharedOrderProductLabel(order),
            },
            {
              header: "Payment",
              key: "payment",
              render: (order) => (
                <div>
                  <p>
                    {formatShareLinkAmount(
                      order.totalMinor,
                      order.currencyCode,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatShareLinkLabel(order.paymentStatus)}
                  </p>
                </div>
              ),
            },
            {
              header: "Reservation",
              key: "reservation",
              render: (order) => (
                <Badge
                  className={cn(
                    "rounded-full",
                    statusTone(order.reservation?.status ?? ""),
                  )}
                >
                  {formatShareLinkLabel(order.reservation?.status)}
                </Badge>
              ),
            },
            {
              header: "Delivery",
              key: "delivery",
              render: (order) => {
                const delivery = deliveryByOrderId.get(order.id)

                return delivery ? (
                  <span className="text-muted-foreground">
                    {formatShareLinkLabel(delivery.status)} /{" "}
                    {delivery.trackingEventCount} events
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {formatShareLinkLabel(order.fulfillment.method)}
                  </span>
                )
              },
            },
            {
              header: "Status",
              key: "status",
              render: (order) => (
                <Badge className={cn("rounded-full", statusTone(order.status))}>
                  {formatShareLinkLabel(order.status)}
                </Badge>
              ),
            },
            {
              header: "Actions",
              key: "actions",
              render: (order) =>
                order.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() =>
                        runOperation(
                          {
                            fulfillmentMethod:
                              order.fulfillment.method ?? "pickup",
                            fulfillmentStatus:
                              order.fulfillment.method === "delivery"
                                ? "delivered"
                                : "picked_up",
                            operation: "order_follow_up",
                            orderId: order.id,
                            paymentMethod: "cash",
                            status: "completed",
                          },
                          "Shared-link order completed.",
                        )
                      }
                    >
                      Complete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() =>
                        runOperation(
                          {
                            operation: "order_follow_up",
                            orderId: order.id,
                            status: "cancelled",
                          },
                          "Shared-link order cancelled.",
                        )
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Closed</span>
                ),
            },
          ]}
        />
      </section>

      <DashboardSheet
        open={isCreateOpen}
        title="Create generated link"
        description="Choose an active product and optional label."
        onClose={() => setIsCreateOpen(false)}
      >
        <form className="grid gap-4" onSubmit={submitCreateLink}>
          <Field label="Product">
            <Select
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
              required
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label">
            <TextInput
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="WhatsApp campaign"
            />
          </Field>
          <Button type="submit" disabled={isSaving || !selectedProductId}>
            {isSaving ? "Creating..." : "Create link"}
          </Button>
        </form>
      </DashboardSheet>
    </div>
  )
}
