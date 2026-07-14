import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"

export type SalesOperationFilters = {
  search?: string
  status?: string
}

export type DashboardSaleRow = {
  createdAt: string
  currencyCode: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  id: string
  lines: Array<{
    productName: string
    quantity: number
    totalMinor: number
    unitName: string
  }>
  orderNumber: string
  payment: {
    method: string | null
    state: string | null
  }
  paymentStatus: string
  status: string
  totalMinor: number
}

export type DashboardSessionRow = {
  closedAt: string | null
  expectedCashMinor: number
  id: string
  openedAt: string
  payments: {
    cardMinor: number
    cashMinor: number
    creditMinor: number
    grossMinor: number
    receiptCount: number
    transferMinor: number
  }
  review?: {
    status: string
  } | null
  status: string
  user: {
    displayName: string
    email: string | null
    id: string
  }
  variance: {
    cardMinor: number | null
    cashMinor: number | null
    creditMinor: number | null
    transferMinor: number | null
  }
}

export type DashboardCustomerRow = {
  email: string | null
  firstSeenAt: string
  id: string
  identityType: string
  lastOrder: {
    createdAt: string
    orderNumber: string
    paymentStatus: string
    status: string
    totalMinor: number
  }
  lastSeenAt: string
  name: string
  orderCount: number
  phone: string | null
  totalMinor: number
}

export function canUseSalesOperations(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canOperatePos(normalizedRole) : false
}

export function canManageSalesReports(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canManageSalesOperations(normalizedRole) : false
}

export function getSalesActorScope(
  role: string | null | undefined,
  userId: string,
) {
  return canManageSalesReports(role) ? undefined : userId
}

export function formatMinorAmount(value: number, currencyCode = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value / 100)
}

export function getPaymentLabel(value: string | null | undefined) {
  if (!value) return "Unknown"

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

export function getSaleCustomerLabel(sale: DashboardSaleRow) {
  return (
    sale.customer.name ||
    sale.customer.phone ||
    sale.customer.email ||
    "Walk-in"
  )
}

export function getSaleProductSummary(sale: DashboardSaleRow) {
  if (sale.lines.length === 0) return "No line items"
  if (sale.lines.length === 1) {
    const line = sale.lines[0]

    if (!line) return "No line items"

    return `${line.productName} - ${line.quantity} ${line.unitName}`
  }

  return `${sale.lines.length} line items`
}

export function getSessionVarianceMinor(session: DashboardSessionRow): number {
  return Object.values(session.variance).reduce<number>(
    (total, value) => total + (value ?? 0),
    0,
  )
}

export function filterSalesRows(
  rows: DashboardSaleRow[],
  filters: SalesOperationFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const status = filters.status?.trim().toUpperCase() ?? ""

  return rows.filter((sale) => {
    const matchesStatus = status
      ? sale.status === status || sale.paymentStatus === status
      : true
    const matchesSearch = search
      ? [
          sale.orderNumber,
          getSaleCustomerLabel(sale),
          sale.payment.method ?? "",
          sale.status,
          sale.paymentStatus,
          ...sale.lines.map((line) => line.productName),
          ...sale.lines.map((line) => line.unitName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesStatus && matchesSearch
  })
}
