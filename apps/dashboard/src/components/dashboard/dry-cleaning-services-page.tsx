"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { formatMinorAmount, getPaymentLabel } from "@/lib/sales-operations"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import {
  Add01Icon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  DeliveryTruck01Icon,
  Package01Icon,
  Search01Icon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { useMemo, useState } from "react"

type ServiceItem = RouterOutputs["retailOps"]["dryCleaningServiceItems"][number]
type ServiceOrder =
  RouterOutputs["retailOps"]["dryCleaningServiceOrders"][number]
type ServiceRequest =
  RouterOutputs["retailOps"]["dryCleaningServiceRequests"][number]
type ServiceRequestLink =
  RouterOutputs["retailOps"]["dryCleaningServiceRequestLinks"][number]
type ServiceReport = RouterOutputs["retailOps"]["dryCleaningOperationalReport"]

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

type ServiceForm = {
  category: string
  estimatedTurnaroundHours: string
  lgPrice: string
  name: string
  price: string
  smPrice: string
}

type OrderLineForm = {
  id: string
  note: string
  quantity: string
  serviceItemId: string
  variantId: string
}

type OrderForm = {
  customerEmail: string
  customerName: string
  customerPhone: string
  customerSearch: string
  dueAt: string
  evidenceLabel: string
  evidenceUrl: string
  express: boolean
  lines: OrderLineForm[]
  notes: string
  paymentStatus: ServiceOrder["paymentStatus"]
}

type SettingsForm = {
  expressSurchargePercent: string
}

type StatusAction = {
  nextStatus: ServiceOrder["status"]
  order: ServiceOrder
} | null

type StatusForm = {
  evidenceLabel: string
  evidenceUrl: string
  note: string
  notifyCustomer: boolean
}

const emptyServiceForm: ServiceForm = {
  category: "Garments",
  estimatedTurnaroundHours: "48",
  lgPrice: "",
  name: "",
  price: "",
  smPrice: "",
}

function createEmptyOrderLine(): OrderLineForm {
  return {
    id: `line-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    note: "",
    quantity: "1",
    serviceItemId: "",
    variantId: "",
  }
}

const emptyOrderForm: OrderForm = {
  customerEmail: "",
  customerName: "",
  customerPhone: "",
  customerSearch: "",
  dueAt: "",
  evidenceLabel: "",
  evidenceUrl: "",
  express: false,
  lines: [createEmptyOrderLine()],
  notes: "",
  paymentStatus: "pay_on_collection",
}

const statusLabels: Record<ServiceOrder["status"], string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  delayed: "Delayed",
  delivery_pending: "Out for delivery",
  in_progress: "In progress",
  pickup_pending: "Pickup pending",
  ready: "Ready",
  received: "Received",
}

const statusTones: Record<ServiceOrder["status"], string> = {
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-emerald-50 text-emerald-700",
  delayed: "bg-amber-50 text-amber-700",
  delivery_pending: "bg-blue-50 text-blue-700",
  in_progress: "bg-sky-50 text-sky-700",
  pickup_pending: "bg-violet-50 text-violet-700",
  ready: "bg-primary/10 text-primary",
  received: "bg-muted text-foreground",
}

const nextStatuses: Record<ServiceOrder["status"], ServiceOrder["status"][]> = {
  cancelled: [],
  completed: [],
  delayed: ["in_progress", "ready", "cancelled"],
  delivery_pending: ["completed", "delayed"],
  in_progress: ["ready", "delayed", "cancelled"],
  pickup_pending: ["completed", "delayed"],
  ready: ["pickup_pending", "delivery_pending", "completed"],
  received: ["in_progress", "delayed", "cancelled"],
}

const requestStatusTones: Record<ServiceRequest["status"], string> = {
  cancelled: "bg-muted text-muted-foreground",
  confirmed: "bg-sky-50 text-sky-700",
  converted: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-destructive/10 text-destructive",
}

function parseMajorCurrencyToMinor(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return null

  return Math.round(amount * 100)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not set"

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  })
}

function getRequestLinkUrl(token: string) {
  const origin =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    (typeof window === "undefined"
      ? "https://ewatrade.com"
      : window.location.origin)

  return `${origin.replace(/\/$/, "")}/service-request/${token}`
}

function getStatusActionLabel(status: ServiceOrder["status"]) {
  if (status === "delivery_pending") return "Out for delivery"
  if (status === "completed") return "Deliver / complete"
  return statusLabels[status]
}

function getServiceItemPrice(item: ServiceItem, variantId: string) {
  const variant = variantId
    ? item.variants.find((entry) => entry.id === variantId)
    : null

  return variant?.priceMinor ?? item.priceMinor
}

function applySurcharge(priceMinor: number, surchargePercent: number) {
  return Math.round(priceMinor * (1 + surchargePercent / 100))
}

function normalizeQuantity(value: string) {
  const quantity = Number(value)

  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1
}

function uniqueCustomers(orders: ServiceOrder[]) {
  const seen = new Set<string>()

  return orders.flatMap((order) => {
    const key = [
      order.customer.phone ?? "",
      order.customer.email ?? "",
      order.customer.name,
    ]
      .join("|")
      .toLowerCase()

    if (seen.has(key)) return []
    seen.add(key)

    return [order.customer]
  })
}

function Field({
  children,
  hint,
  label,
}: {
  children: ReactNode
  hint?: string
  label: string
}) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
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

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function MetricCard({
  label,
  sub,
  value,
}: {
  label: string
  sub?: string
  value: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function ServiceLineSummary({ order }: { order: ServiceOrder }) {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {order.lines.slice(0, 3).map((line) => (
        <span key={`${order.id}-${line.serviceItemId}-${line.variantId}`}>
          {line.quantity} x {line.serviceItemName}
          {line.variantName ? ` / ${line.variantName}` : ""}
        </span>
      ))}
      {order.lines.length > 3 ? (
        <span>{order.lines.length - 3} more</span>
      ) : null}
    </div>
  )
}

export function DryCleaningServicesPage({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<ServiceOrder["status"] | "">("")
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false)
  const [orderSheetOpen, setOrderSheetOpen] = useState(false)
  const [requestLinkSheetOpen, setRequestLinkSheetOpen] = useState(false)
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false)
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm)
  const [orderForm, setOrderForm] = useState<OrderForm>(emptyOrderForm)
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    expressSurchargePercent: "0",
  })
  const [statusAction, setStatusAction] = useState<StatusAction>(null)
  const [statusForm, setStatusForm] = useState<StatusForm>({
    evidenceLabel: "",
    evidenceUrl: "",
    note: "",
    notifyCustomer: false,
  })
  const [requestLinkLabel, setRequestLinkLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const serviceItemsQuery = useQuery(
    trpc.retailOps.dryCleaningServiceItems.queryOptions(
      { includeArchived: false, storeId: store.id },
      { retry: false },
    ),
  )
  const ordersQuery = useQuery(
    trpc.retailOps.dryCleaningServiceOrders.queryOptions(
      { limit: 100, storeId: store.id, status: status || undefined },
      { retry: false },
    ),
  )
  const requestsQuery = useQuery(
    trpc.retailOps.dryCleaningServiceRequests.queryOptions(
      { limit: 50, storeId: store.id },
      { retry: false },
    ),
  )
  const requestLinksQuery = useQuery(
    trpc.retailOps.dryCleaningServiceRequestLinks.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const reportQuery = useQuery(
    trpc.retailOps.dryCleaningOperationalReport.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const settingsQuery = useQuery(
    trpc.retailOps.dryCleaningSettings.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )

  const serviceItems = serviceItemsQuery.data ?? []
  const orders = ordersQuery.data ?? []
  const requests = requestsQuery.data ?? []
  const requestLinks = requestLinksQuery.data ?? []
  const report = reportQuery.data
  const settings = settingsQuery.data
  const expressSurchargePercent = settings?.expressSurchargePercent ?? 0

  const refreshOperations = () => {
    void serviceItemsQuery.refetch()
    void ordersQuery.refetch()
    void requestsQuery.refetch()
    void requestLinksQuery.refetch()
    void reportQuery.refetch()
    void settingsQuery.refetch()
  }

  const createServiceMutation = useMutation(
    trpc.retailOps.createDryCleaningServiceItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setServiceForm(emptyServiceForm)
        setServiceSheetOpen(false)
        setNotice("Service item added.")
        refreshOperations()
      },
    }),
  )
  const updateSettingsMutation = useMutation(
    trpc.retailOps.updateDryCleaningSettings.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (nextSettings) => {
        setSettingsForm({
          expressSurchargePercent: String(nextSettings.expressSurchargePercent),
        })
        setSettingsSheetOpen(false)
        setNotice("Express surcharge updated.")
        refreshOperations()
      },
    }),
  )
  const createOrderMutation = useMutation(
    trpc.retailOps.createDryCleaningServiceOrder.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setOrderForm({ ...emptyOrderForm, lines: [createEmptyOrderLine()] })
        setOrderSheetOpen(false)
        setNotice("Service order received.")
        refreshOperations()
      },
    }),
  )
  const updateOrderStatusMutation = useMutation(
    trpc.retailOps.updateDryCleaningServiceOrderStatus.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (result) => {
        setStatusAction(null)
        setStatusForm({
          evidenceLabel: "",
          evidenceUrl: "",
          note: "",
          notifyCustomer: false,
        })
        setNotice(
          result.notificationIntent
            ? "Order updated and customer message copy generated."
            : "Order status updated.",
        )
        refreshOperations()
      },
    }),
  )
  const createRequestLinkMutation = useMutation(
    trpc.retailOps.createDryCleaningServiceRequestLink.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: (link) => {
        setRequestLinkLabel("")
        setRequestLinkSheetOpen(false)
        setNotice(`Request link created: ${getRequestLinkUrl(link.token)}`)
        refreshOperations()
      },
    }),
  )
  const updateRequestMutation = useMutation(
    trpc.retailOps.updateDryCleaningServiceRequestStatus.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setNotice("Service request updated.")
        refreshOperations()
      },
    }),
  )
  const convertRequestMutation = useMutation(
    trpc.retailOps.convertDryCleaningServiceRequest.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setNotice("Service request converted to an order.")
        refreshOperations()
      },
    }),
  )

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return orders

    return orders.filter((order) =>
      [
        order.id,
        order.customer.name,
        order.customer.phone ?? "",
        order.customer.email ?? "",
        order.trackingToken,
        order.paymentStatus,
        order.status,
        ...order.lines.map((line) => line.serviceItemName),
        ...order.lines.map((line) => line.variantName ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [orders, search])

  const dueOrders = useMemo(() => {
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    return orders.filter((order) => {
      if (!order.dueAt) return false
      if (order.status === "completed" || order.status === "cancelled") {
        return false
      }

      return new Date(order.dueAt).getTime() <= todayEnd.getTime()
    })
  }, [orders])

  const customerMatches = useMemo(() => {
    const customers = uniqueCustomers(orders)
    const query = orderForm.customerSearch.trim().toLowerCase()

    if (!query) return customers.slice(0, 5)

    return customers
      .filter((customer) =>
        [customer.name, customer.phone ?? "", customer.email ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 5)
  }, [orderForm.customerSearch, orders])

  const orderTotalMinor = useMemo(
    () =>
      orderForm.lines.reduce((total, line) => {
        const item = serviceItems.find(
          (entry) => entry.id === line.serviceItemId,
        )
        if (!item) return total

        const basePrice = getServiceItemPrice(item, line.variantId)
        const unitPrice = orderForm.express
          ? applySurcharge(basePrice, expressSurchargePercent)
          : basePrice

        return total + unitPrice * normalizeQuantity(line.quantity)
      }, 0),
    [expressSurchargePercent, orderForm.express, orderForm.lines, serviceItems],
  )

  function openSettings() {
    setError(null)
    setNotice(null)
    setSettingsForm({
      expressSurchargePercent: String(expressSurchargePercent),
    })
    setSettingsSheetOpen(true)
  }

  function selectCustomer(customer: ServiceOrder["customer"]) {
    setOrderForm((current) => ({
      ...current,
      customerEmail: customer.email ?? "",
      customerName: customer.name,
      customerPhone: customer.phone ?? "",
      customerSearch: "",
    }))
  }

  function updateLine(lineId: string, patch: Partial<OrderLineForm>) {
    setOrderForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === lineId ? { ...line, ...patch } : line,
      ),
    }))
  }

  function addOrderLine() {
    setOrderForm((current) => ({
      ...current,
      lines: [...current.lines, createEmptyOrderLine()],
    }))
  }

  function removeOrderLine(lineId: string) {
    setOrderForm((current) => ({
      ...current,
      lines:
        current.lines.length > 1
          ? current.lines.filter((line) => line.id !== lineId)
          : current.lines,
    }))
  }

  function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const priceMinor = parseMajorCurrencyToMinor(serviceForm.price)
    const smPriceMinor = serviceForm.smPrice.trim()
      ? parseMajorCurrencyToMinor(serviceForm.smPrice)
      : null
    const lgPriceMinor = serviceForm.lgPrice.trim()
      ? parseMajorCurrencyToMinor(serviceForm.lgPrice)
      : null

    if (!priceMinor || !serviceForm.name.trim()) {
      setError("Enter the service name and standard price.")
      return
    }

    createServiceMutation.mutate({
      category: serviceForm.category.trim() || undefined,
      estimatedTurnaroundHours: serviceForm.estimatedTurnaroundHours
        ? Number(serviceForm.estimatedTurnaroundHours)
        : undefined,
      name: serviceForm.name.trim(),
      priceMinor,
      storeId: store.id,
      variants: [
        ...(smPriceMinor !== null
          ? [{ name: "SM", priceMinor: smPriceMinor }]
          : []),
        ...(lgPriceMinor !== null
          ? [{ name: "LG", priceMinor: lgPriceMinor }]
          : []),
      ],
    })
  }

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    updateSettingsMutation.mutate({
      expressSurchargePercent: Number(
        settingsForm.expressSurchargePercent || 0,
      ),
      storeId: store.id,
    })
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const lines = orderForm.lines.flatMap((line) => {
      const item = serviceItems.find((entry) => entry.id === line.serviceItemId)
      if (!item) return []

      const basePrice = getServiceItemPrice(item, line.variantId)
      const unitPriceMinor = orderForm.express
        ? applySurcharge(basePrice, expressSurchargePercent)
        : undefined

      return [
        {
          note: line.note.trim() || undefined,
          quantity: normalizeQuantity(line.quantity),
          serviceItemId: item.id,
          unitPriceMinor,
          variantId: line.variantId || undefined,
        },
      ]
    })

    if (!orderForm.customerName.trim()) {
      setError("Enter or select a customer.")
      return
    }
    if (lines.length === 0) {
      setError("Add at least one service line.")
      return
    }

    createOrderMutation.mutate({
      customer: {
        email: orderForm.customerEmail.trim() || undefined,
        name: orderForm.customerName.trim(),
        phone: orderForm.customerPhone.trim() || undefined,
      },
      dueAt: orderForm.dueAt ? new Date(orderForm.dueAt) : undefined,
      evidence: orderForm.evidenceUrl.trim()
        ? [
            {
              label: orderForm.evidenceLabel.trim() || undefined,
              url: orderForm.evidenceUrl.trim(),
            },
          ]
        : [],
      lines,
      notes: [
        orderForm.notes.trim(),
        orderForm.express
          ? `Express order surcharge ${expressSurchargePercent}% applied.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      paymentStatus: orderForm.paymentStatus,
      storeId: store.id,
    })
  }

  function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!statusAction) return

    updateOrderStatusMutation.mutate({
      evidence: statusForm.evidenceUrl.trim()
        ? [
            {
              label: statusForm.evidenceLabel.trim() || undefined,
              url: statusForm.evidenceUrl.trim(),
            },
          ]
        : [],
      note: statusForm.note.trim() || undefined,
      notifyCustomer: statusForm.notifyCustomer,
      orderId: statusAction.order.id,
      status: statusAction.nextStatus,
      storeId: store.id,
    })
  }

  function openStatusAction(
    order: ServiceOrder,
    nextStatus: ServiceOrder["status"],
  ) {
    setError(null)
    setNotice(null)
    setStatusAction({ nextStatus, order })
    setStatusForm({
      evidenceLabel: "",
      evidenceUrl: "",
      note: "",
      notifyCustomer: nextStatus === "ready" || nextStatus === "delayed",
    })
  }

  function submitRequestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    createRequestLinkMutation.mutate({
      label: requestLinkLabel.trim() || undefined,
      storeId: store.id,
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Store04Icon} className="size-4" />
            Dry Cleaning / Laundry
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Service orders
          </h1>
          <p className="text-sm text-muted-foreground">
            {store.name} · catalog, orders, due work, requests, and delivery
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={openSettings}
          >
            <HugeiconsIcon icon={Calendar03Icon} className="size-4" />
            Express settings
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => setRequestLinkSheetOpen(true)}
          >
            <HugeiconsIcon icon={DeliveryTruck01Icon} className="size-4" />
            Request link
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => setServiceSheetOpen(true)}
          >
            <HugeiconsIcon icon={Package01Icon} className="size-4" />
            Service item
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-lg"
            onClick={() => setOrderSheetOpen(true)}
            disabled={serviceItems.length === 0}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New order
          </Button>
        </div>
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
        <MetricCard label="Orders" value={report?.orderCount ?? "0"} />
        <MetricCard label="Due today" value={dueOrders.length} />
        <MetricCard label="Ready" value={report?.statusCounts.ready ?? "0"} />
        <MetricCard
          label="Unpaid"
          value={
            (report?.paymentStatusCounts.unpaid ?? 0) +
            (report?.paymentStatusCounts.pay_on_collection ?? 0) +
            (report?.paymentStatusCounts.pay_on_delivery ?? 0)
          }
        />
        <MetricCard
          label="Revenue"
          value={formatMinorAmount(
            report?.revenueMinor ?? 0,
            store.currencyCode,
          )}
          sub="Completed orders"
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <TextInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by customer, phone, tracking, or service"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ServiceOrder["status"] | "")
              }
              className="md:w-[190px]"
              aria-label="Order status"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <DashboardTable
            rows={filteredOrders}
            isLoading={ordersQuery.isLoading}
            getRowKey={(order) => order.id}
            emptyState={
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <HugeiconsIcon
                    icon={Package01Icon}
                    className="size-5 text-muted-foreground"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">No service orders found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add services, then receive the first customer package.
                  </p>
                </div>
              </div>
            }
            columns={[
              {
                header: "Customer",
                key: "customer",
                render: (order) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {order.customer.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.customer.phone ??
                        order.customer.email ??
                        "Walk-in"}
                    </p>
                  </div>
                ),
              },
              {
                header: "Services",
                key: "services",
                render: (order) => <ServiceLineSummary order={order} />,
              },
              {
                header: "Due",
                key: "due",
                render: (order) => (
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(order.dueAt)}
                  </span>
                ),
              },
              {
                header: "Total",
                key: "total",
                render: (order) =>
                  formatMinorAmount(order.totalMinor, order.currencyCode),
              },
              {
                header: "Payment",
                key: "payment",
                render: (order) => getPaymentLabel(order.paymentStatus),
              },
              {
                header: "Status",
                key: "status",
                render: (order) => (
                  <Badge
                    className={cn("rounded-full", statusTones[order.status])}
                  >
                    {statusLabels[order.status]}
                  </Badge>
                ),
              },
              {
                header: "Actions",
                key: "actions",
                render: (order) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    {nextStatuses[order.status].map((nextStatus) => (
                      <Button
                        key={`${order.id}-${nextStatus}`}
                        type="button"
                        variant={
                          nextStatus === "completed" ? "default" : "outline"
                        }
                        size="sm"
                        className="rounded-lg"
                        onClick={() => openStatusAction(order, nextStatus)}
                      >
                        {getStatusActionLabel(nextStatus)}
                      </Button>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>

        <aside className="grid gap-4 content-start">
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Calendar03Icon}
                className="size-4 text-primary"
              />
              <h2 className="text-sm font-semibold">Due work</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {dueOrders.slice(0, 6).map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {order.customer.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(order.dueAt)}
                      </p>
                    </div>
                    <Badge
                      className={cn("rounded-full", statusTones[order.status])}
                    >
                      {statusLabels[order.status]}
                    </Badge>
                  </div>
                </div>
              ))}
              {dueOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No due or overdue service orders.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={UserCircle02Icon}
                className="size-4 text-primary"
              />
              <h2 className="text-sm font-semibold">Public requests</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {requests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {request.customer.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMinorAmount(
                          request.totalMinor,
                          store.currencyCode,
                        )}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full",
                        requestStatusTones[request.status],
                      )}
                    >
                      {getPaymentLabel(request.status)}
                    </Badge>
                  </div>
                  {request.status === "pending" ||
                  request.status === "confirmed" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.status === "pending" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          onClick={() =>
                            updateRequestMutation.mutate({
                              requestId: request.id,
                              status: "confirmed",
                              storeId: store.id,
                            })
                          }
                        >
                          Confirm
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-lg"
                        onClick={() =>
                          convertRequestMutation.mutate({
                            paymentStatus: "pay_on_collection",
                            requestId: request.id,
                            storeId: store.id,
                          })
                        }
                      >
                        Convert
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        onClick={() =>
                          updateRequestMutation.mutate({
                            requestId: request.id,
                            status: "rejected",
                            storeId: store.id,
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Customer service requests will appear here.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Request links</h2>
              <span className="text-xs text-muted-foreground">
                {requestLinks.length}
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {requestLinks.slice(0, 3).map((link) => (
                <RequestLinkRow key={link.id} link={link} />
              ))}
              {requestLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create a request link for pickup/service requests.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      <CatalogPanel serviceItems={serviceItems} store={store} report={report} />

      <DashboardSheet
        open={serviceSheetOpen}
        onClose={() => setServiceSheetOpen(false)}
        title="New service item"
        description="Use SM and LG variants when size changes the price."
      >
        <form className="grid gap-4" onSubmit={submitService}>
          <Field label="Service name">
            <TextInput
              value={serviceForm.name}
              onChange={(event) =>
                setServiceForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Enter service name"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <TextInput
                value={serviceForm.category}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="Enter category"
              />
            </Field>
            <Field label="Turnaround hours">
              <TextInput
                inputMode="numeric"
                value={serviceForm.estimatedTurnaroundHours}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    estimatedTurnaroundHours: event.target.value,
                  }))
                }
                placeholder="Enter hours"
              />
            </Field>
          </div>
          <Field label={`Standard price (${store.currencyCode})`}>
            <TextInput
              inputMode="decimal"
              value={serviceForm.price}
              onChange={(event) =>
                setServiceForm((current) => ({
                  ...current,
                  price: event.target.value,
                }))
              }
              placeholder="Enter standard price"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SM price">
              <TextInput
                inputMode="decimal"
                value={serviceForm.smPrice}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    smPrice: event.target.value,
                  }))
                }
                placeholder="Enter small price"
              />
            </Field>
            <Field label="LG price">
              <TextInput
                inputMode="decimal"
                value={serviceForm.lgPrice}
                onChange={(event) =>
                  setServiceForm((current) => ({
                    ...current,
                    lgPrice: event.target.value,
                  }))
                }
                placeholder="Enter large price"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setServiceSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createServiceMutation.isPending}>
              {createServiceMutation.isPending ? "Adding..." : "Add service"}
            </Button>
          </div>
        </form>
      </DashboardSheet>

      <DashboardSheet
        open={settingsSheetOpen}
        onClose={() => setSettingsSheetOpen(false)}
        title="Express settings"
        description="Express orders use this percentage to calculate line prices."
      >
        <form className="grid gap-4" onSubmit={submitSettings}>
          <Field
            label="Express surcharge percentage"
            hint="Use 0 when express pricing is not active."
          >
            <TextInput
              inputMode="numeric"
              min={0}
              max={500}
              type="number"
              value={settingsForm.expressSurchargePercent}
              onChange={(event) =>
                setSettingsForm({
                  expressSurchargePercent: event.target.value,
                })
              }
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSettingsSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateSettingsMutation.isPending}>
              {updateSettingsMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </form>
      </DashboardSheet>

      <DashboardSheet
        open={orderSheetOpen}
        onClose={() => setOrderSheetOpen(false)}
        title="Receive service order"
        description={`Estimated total: ${formatMinorAmount(
          orderTotalMinor,
          store.currencyCode,
        )}`}
      >
        <form className="grid gap-5" onSubmit={submitOrder}>
          <div className="grid gap-3 rounded-lg border border-border p-3">
            <Field label="Find customer">
              <TextInput
                value={orderForm.customerSearch}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    customerSearch: event.target.value,
                  }))
                }
                placeholder="Search by phone, name, or email"
              />
            </Field>
            {customerMatches.length > 0 ? (
              <div className="grid gap-2">
                {customerMatches.map((customer) => (
                  <button
                    key={`${customer.name}-${customer.phone}-${customer.email}`}
                    type="button"
                    className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:bg-muted"
                    onClick={() => selectCustomer(customer)}
                  >
                    <span className="font-medium">{customer.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {customer.phone ?? customer.email}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name">
              <TextInput
                value={orderForm.customerName}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    customerName: event.target.value,
                  }))
                }
                placeholder="Enter customer name"
                required
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={orderForm.customerPhone}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    customerPhone: event.target.value,
                  }))
                }
                placeholder="Enter phone number"
              />
            </Field>
          </div>
          <Field label="Email">
            <TextInput
              type="email"
              value={orderForm.customerEmail}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  customerEmail: event.target.value,
                }))
              }
              placeholder="Enter email address"
            />
          </Field>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Service lines</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={addOrderLine}
              >
                Add line
              </Button>
            </div>
            {orderForm.lines.map((line, index) => {
              const selectedItem = serviceItems.find(
                (item) => item.id === line.serviceItemId,
              )

              return (
                <div
                  key={line.id}
                  className="grid gap-3 rounded-lg border border-border p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
                    <Field label="Service">
                      <Select
                        value={line.serviceItemId}
                        onChange={(event) =>
                          updateLine(line.id, {
                            serviceItemId: event.target.value,
                            variantId: "",
                          })
                        }
                        required
                      >
                        <option value="">Choose service</option>
                        {serviceItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ·{" "}
                            {formatMinorAmount(
                              item.priceMinor,
                              store.currencyCode,
                            )}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Variant">
                      <Select
                        value={line.variantId}
                        onChange={(event) =>
                          updateLine(line.id, { variantId: event.target.value })
                        }
                        disabled={!selectedItem?.variants.length}
                      >
                        <option value="">Standard</option>
                        {selectedItem?.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name} ·{" "}
                            {formatMinorAmount(
                              variant.priceMinor,
                              store.currencyCode,
                            )}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Qty">
                      <TextInput
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.id, { quantity: event.target.value })
                        }
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Line note">
                    <TextInput
                      value={line.note}
                      onChange={(event) =>
                        updateLine(line.id, { note: event.target.value })
                      }
                      placeholder="Enter stains, missing buttons, or bag notes"
                    />
                  </Field>
                  {orderForm.lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit rounded-lg"
                      onClick={() => removeOrderLine(line.id)}
                    >
                      Remove line {index + 1}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment">
              <Select
                value={orderForm.paymentStatus}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    paymentStatus: event.target
                      .value as OrderForm["paymentStatus"],
                  }))
                }
              >
                <option value="paid">Paid now</option>
                <option value="partial">Partial payment</option>
                <option value="pay_on_collection">Pay on collection</option>
                <option value="pay_on_delivery">Pay on delivery</option>
                <option value="unpaid">Unpaid</option>
              </Select>
            </Field>
            <Field label="Ready / delivery time">
              <TextInput
                type="datetime-local"
                value={orderForm.dueAt}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </Field>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={orderForm.express}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  express: event.target.checked,
                }))
              }
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Express order</span>
              <span className="text-muted-foreground">
                Adds {expressSurchargePercent}% to selected line prices.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Evidence label">
              <TextInput
                value={orderForm.evidenceLabel}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    evidenceLabel: event.target.value,
                  }))
                }
                placeholder="Enter evidence label"
              />
            </Field>
            <Field label="Evidence URL">
              <TextInput
                type="url"
                value={orderForm.evidenceUrl}
                onChange={(event) =>
                  setOrderForm((current) => ({
                    ...current,
                    evidenceUrl: event.target.value,
                  }))
                }
                placeholder="Enter image or video URL"
              />
            </Field>
          </div>
          <Field label="Order notes">
            <TextArea
              value={orderForm.notes}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Enter care instructions or delivery notes"
            />
          </Field>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Order total</span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatMinorAmount(orderTotalMinor, store.currencyCode)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOrderSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createOrderMutation.isPending}>
              {createOrderMutation.isPending ? "Saving..." : "Receive order"}
            </Button>
          </div>
        </form>
      </DashboardSheet>

      <DashboardSheet
        open={statusAction !== null}
        onClose={() => setStatusAction(null)}
        title={
          statusAction
            ? getStatusActionLabel(statusAction.nextStatus)
            : "Update order"
        }
        description={statusAction?.order.customer.name}
      >
        <form className="grid gap-4" onSubmit={submitStatus}>
          <Field label="Note">
            <TextArea
              value={statusForm.note}
              onChange={(event) =>
                setStatusForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Enter update note"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Evidence label">
              <TextInput
                value={statusForm.evidenceLabel}
                onChange={(event) =>
                  setStatusForm((current) => ({
                    ...current,
                    evidenceLabel: event.target.value,
                  }))
                }
                placeholder="Enter evidence label"
              />
            </Field>
            <Field label="Evidence URL">
              <TextInput
                type="url"
                value={statusForm.evidenceUrl}
                onChange={(event) =>
                  setStatusForm((current) => ({
                    ...current,
                    evidenceUrl: event.target.value,
                  }))
                }
                placeholder="Enter image or video URL"
              />
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={statusForm.notifyCustomer}
              onChange={(event) =>
                setStatusForm((current) => ({
                  ...current,
                  notifyCustomer: event.target.checked,
                }))
              }
              className="mt-1"
            />
            <span>
              <span className="block font-medium">
                Generate customer message
              </span>
              <span className="text-muted-foreground">
                Ready and delay updates create manual WhatsApp/SMS copy.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStatusAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateOrderStatusMutation.isPending}
            >
              {updateOrderStatusMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </div>
        </form>
      </DashboardSheet>

      <DashboardSheet
        open={requestLinkSheetOpen}
        onClose={() => setRequestLinkSheetOpen(false)}
        title="Create request link"
        description="Customers can use the link to submit service or pickup requests."
      >
        <form className="grid gap-4" onSubmit={submitRequestLink}>
          <Field label="Link label">
            <TextInput
              value={requestLinkLabel}
              onChange={(event) => setRequestLinkLabel(event.target.value)}
              placeholder="Enter link label"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRequestLinkSheetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createRequestLinkMutation.isPending}
            >
              {createRequestLinkMutation.isPending
                ? "Creating..."
                : "Create link"}
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}

function CatalogPanel({
  report,
  serviceItems,
  store,
}: {
  report: ServiceReport | undefined
  serviceItems: ServiceItem[]
  store: StoreSummary
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Package01Icon} className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Service catalog</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs font-medium uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Service</th>
                <th className="py-3 pr-4">Category</th>
                <th className="py-3 pr-4">Standard</th>
                <th className="py-3 pr-4">Variants</th>
                <th className="py-3">Turnaround</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {serviceItems.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4 font-medium">{item.name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.category ?? "General"}
                  </td>
                  <td className="py-3 pr-4">
                    {formatMinorAmount(item.priceMinor, store.currencyCode)}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {item.variants.length
                      ? item.variants
                          .map(
                            (variant) =>
                              `${variant.name} ${formatMinorAmount(
                                variant.priceMinor,
                                store.currencyCode,
                              )}`,
                          )
                          .join(", ")
                      : "Standard only"}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {item.estimatedTurnaroundHours
                      ? `${item.estimatedTurnaroundHours}h`
                      : "Not set"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {serviceItems.length === 0 ? (
            <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">
              Add shirt and trouser, agbada, jalabia, and iro and buba to start.
            </p>
          ) : null}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            className="size-4 text-primary"
          />
          <h2 className="text-sm font-semibold">Popular services</h2>
        </div>
        <div className="mt-4 grid gap-3">
          {(report?.popularServices ?? []).slice(0, 5).map((service) => (
            <div
              key={service.serviceItemId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {service.serviceItemName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {service.quantity} piece{service.quantity === 1 ? "" : "s"}
                </p>
              </div>
              <span className="font-medium">
                {formatMinorAmount(service.totalMinor, store.currencyCode)}
              </span>
            </div>
          ))}
          {report?.popularServices.length ? null : (
            <p className="text-sm text-muted-foreground">
              Service totals appear after orders are received.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function RequestLinkRow({ link }: { link: ServiceRequestLink }) {
  const url = getRequestLinkUrl(link.token)

  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{link.label}</p>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
        </div>
        <Badge
          className={cn(
            "rounded-full",
            link.disabledAt
              ? "bg-muted text-muted-foreground"
              : "bg-emerald-50 text-emerald-700",
          )}
        >
          {link.disabledAt ? "Disabled" : "Active"}
        </Badge>
      </div>
    </div>
  )
}
