import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"

export type ShareLinkFilters = {
  search?: string
  status?: string
}

export type SharedOrderFilters = {
  search?: string
  status?: string
}

export type DashboardShareableProduct = {
  id: string
  name: string
  slug: string
  units: Array<{
    id: string
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string | null
  }>
}

export type DashboardProductShareLink = {
  active: boolean
  createdAt: string
  createdByUserId: string
  deactivatedAt: string | null
  id: string
  label: string | null
  lastActivityAt: string | null
  orderCount: number
  product: {
    id: string
    name: string
    slug: string
  }
  token: string
  url: string
  viewCount: number
}

export type DashboardSharedLinkOrderRequest = {
  createdAt: string
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  fulfillment: {
    fulfilledAt: string | null
    method: string | null
    note: string | null
    status: string | null
  }
  id: string
  line: {
    productName: string
    quantity: number
    totalMinor: number
    unitName: string | null
    unitPriceMinor: number
  } | null
  notification: {
    status: string | null
  }
  orderNumber: string
  paymentState: string | null
  paymentStatus: string
  reservation: {
    quantity: number | null
    status: string | null
  } | null
  shareLink: {
    id: string | null
    label: string | null
    url: string | null
  }
  status: string
  totalMinor: number
  updatedAt: string
}

export type DashboardDeliveryRequest = {
  id: string
  order: {
    id: string
    orderNumber: string
  }
  requestedAt: string
  status: string
  trackingEventCount: number
}

export function canUseShareLinks(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canOperatePos(normalizedRole) : false
}

export function canManageAllShareLinks(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canManageSalesOperations(normalizedRole) : false
}

export function getShareLinkCustomerLabel(
  order: DashboardSharedLinkOrderRequest,
) {
  return (
    order.customer.name ||
    order.customer.phone ||
    order.customer.email ||
    "Customer"
  )
}

export function getSharedOrderProductLabel(
  order: DashboardSharedLinkOrderRequest,
) {
  if (!order.line) return "No product"

  return `${order.line.productName} - ${order.line.quantity} ${order.line.unitName ?? "unit"}`
}

export function formatShareLinkAmount(value: number, currencyCode = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value / 100)
}

export function formatShareLinkLabel(value: string | null | undefined) {
  if (!value) return "Unknown"

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

export function filterShareLinks(
  links: DashboardProductShareLink[],
  filters: ShareLinkFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const status = filters.status?.trim() ?? ""

  return links.filter((link) => {
    const matchesStatus = status
      ? status === "active"
        ? link.active
        : !link.active
      : true
    const matchesSearch = search
      ? [
          link.label ?? "",
          link.product.name,
          link.product.slug,
          link.token,
          link.url,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesStatus && matchesSearch
  })
}

export function filterSharedOrders(
  orders: DashboardSharedLinkOrderRequest[],
  filters: SharedOrderFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const status = filters.status?.trim().toUpperCase() ?? ""

  return orders.filter((order) => {
    const matchesStatus = status ? order.status === status : true
    const matchesSearch = search
      ? [
          order.orderNumber,
          getShareLinkCustomerLabel(order),
          getSharedOrderProductLabel(order),
          order.paymentStatus,
          order.paymentState ?? "",
          order.reservation?.status ?? "",
          order.notification.status ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesStatus && matchesSearch
  })
}
