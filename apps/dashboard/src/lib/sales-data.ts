import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { prisma } from "@ewatrade/db"
import { listCommercialOrders } from "@ewatrade/db/queries"

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function getDashboardCustomerBook(input: {
  role: string
  search?: string
  storeId: string
  tenantId: string
  userId: string
}) {
  const orders = await listCommercialOrders(prisma, {
    limit: 100,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const grouped = new Map<string, DashboardCustomerRow>()
  for (const order of orders) {
    const identity =
      order.customerPhone || order.customerEmail || order.customerName
    const key = identity?.trim().toLowerCase() || `walk-in:${order.id}`
    if (
      input.search &&
      ![order.customerName, order.customerPhone, order.customerEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(input.search.toLowerCase())
    )
      continue
    const previous = grouped.get(key)
    const createdAt = order.createdAt.toISOString()
    const row: DashboardCustomerRow = previous ?? {
      email: order.customerEmail,
      firstSeenAt: createdAt,
      id: key,
      identityType: order.customerPhone
        ? "phone"
        : order.customerEmail
          ? "email"
          : order.customerName
            ? "name"
            : "walk-in",
      lastOrder: {
        createdAt,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        status: order.status,
        totalMinor: order.totalMinor,
      },
      lastSeenAt: createdAt,
      name:
        order.customerName ||
        order.customerPhone ||
        order.customerEmail ||
        "Walk-in customer",
      orderCount: 0,
      phone: order.customerPhone,
      totalMinor: 0,
    }
    row.orderCount += 1
    row.totalMinor += order.totalMinor
    if (createdAt > row.lastSeenAt) {
      row.lastSeenAt = createdAt
      row.lastOrder = {
        createdAt,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        status: order.status,
        totalMinor: order.totalMinor,
      }
    }
    if (createdAt < row.firstSeenAt) row.firstSeenAt = createdAt
    grouped.set(key, row)
  }
  return toJson<DashboardCustomerRow[]>(Array.from(grouped.values()))
}
