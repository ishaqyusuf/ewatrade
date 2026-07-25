import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { listRetailOpsStaff } from "./retail-ops-staff"

export type GlobalSearchResult =
  | {
      createdAt: Date
      id: string
      subtitle: string
      title: string
      type: "catalog_item"
      catalogItemId: string
      catalogKind: "product" | "service"
    }
  | {
      createdAt: Date
      customerEmail: string | null
      customerId: string | null
      customerName: string
      customerPhone: string | null
      id: string
      orderId: string | null
      subtitle: string
      title: string
      type: "customer"
    }
  | {
      createdAt: Date
      id: string
      orderId: string
      subtitle: string
      title: string
      type: "order"
    }
  | {
      createdAt: Date
      id: string
      staffUserId: string
      subtitle: string
      title: string
      type: "staff"
    }
  | {
      createdAt: Date
      id: string
      orderId: string
      serviceJobId: string
      subtitle: string
      title: string
      type: "service_job"
    }

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function resultRank(result: GlobalSearchResult, query: string) {
  const title = normalize(result.title)
  const subtitle = normalize(result.subtitle)
  if (title === query) return 0
  if (title.startsWith(query)) return 1
  if (title.includes(query)) return 2
  if (subtitle.startsWith(query)) return 3
  return 4
}

function customerIdentity(input: {
  customerEmail: string | null
  customerName: string | null
  customerPhone: string | null
}) {
  const email = input.customerEmail?.trim().toLowerCase()
  if (email) return `email:${email}`
  const phone = input.customerPhone?.replace(/[^\d+]/g, "")
  if (phone) return `phone:${phone}`
  const name = input.customerName?.trim().toLowerCase()
  return name ? `name:${name}` : null
}

export async function globalSearch(
  db: PrismaClient,
  input: {
    canSearchStaff: boolean
    limit?: number
    query: string
    tenantId: string
  },
) {
  const query = input.query.trim()
  if (query.length < 2) return []

  const perTypeLimit = Math.min(Math.max(input.limit ?? 6, 1), 10)
  const textWhere = { contains: query, mode: "insensitive" as const }
  const customerOrderWhere: Prisma.CommercialOrderWhereInput = {
    tenantId: input.tenantId,
    OR: [
      { customerEmail: textWhere },
      { customerName: textWhere },
      { customerPhone: textWhere },
    ],
  }

  const [catalogItems, customers, customerOrders, orders, serviceJobs, staff] =
    await Promise.all([
      db.catalogItem.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          description: true,
          id: true,
          kind: true,
          name: true,
          status: true,
        },
        take: perTypeLimit,
        where: {
          OR: [
            { description: textWhere },
            { name: textWhere },
            { slug: textWhere },
          ],
          status: { not: "ARCHIVED" },
          tenantId: input.tenantId,
        },
      }),
      db.customer.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          email: true,
          id: true,
          name: true,
          phone: true,
        },
        take: perTypeLimit,
        where: {
          OR: [{ email: textWhere }, { name: textWhere }, { phone: textWhere }],
          tenantId: input.tenantId,
        },
      }),
      db.commercialOrder.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          customerEmail: true,
          customerName: true,
          customerPhone: true,
          id: true,
        },
        take: perTypeLimit * 2,
        where: customerOrderWhere,
      }),
      db.commercialOrder.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          customerName: true,
          id: true,
          orderNumber: true,
          paymentStatus: true,
          status: true,
        },
        take: perTypeLimit,
        where: {
          OR: [
            { customerEmail: textWhere },
            { customerName: textWhere },
            { customerPhone: textWhere },
            { orderNumber: textWhere },
            {
              lines: {
                some: {
                  snapshot: {
                    is: { catalogItemName: textWhere },
                  },
                },
              },
            },
          ],
          tenantId: input.tenantId,
        },
      }),
      db.serviceJob.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          commercialOrder: {
            select: {
              customerName: true,
              orderNumber: true,
            },
          },
          commercialOrderId: true,
          createdAt: true,
          id: true,
        },
        take: perTypeLimit,
        where: {
          OR: [
            { clientJobId: textWhere },
            {
              commercialOrder: {
                is: {
                  OR: [
                    { customerEmail: textWhere },
                    { customerName: textWhere },
                    { customerPhone: textWhere },
                    { orderNumber: textWhere },
                  ],
                },
              },
            },
            {
              lines: {
                some: {
                  commercialOrderLine: {
                    snapshot: {
                      is: { catalogItemName: textWhere },
                    },
                  },
                },
              },
            },
          ],
          tenantId: input.tenantId,
        },
      }),
      input.canSearchStaff
        ? listRetailOpsStaff(db, {
            limit: perTypeLimit,
            search: query,
            tenantId: input.tenantId,
          })
        : [],
    ])

  const results: GlobalSearchResult[] = []

  for (const item of catalogItems) {
    const kind = item.kind === "SERVICE" ? "service" : "product"
    results.push({
      catalogItemId: item.id,
      catalogKind: kind,
      createdAt: item.createdAt,
      id: `catalog_item:${item.id}`,
      subtitle: `${kind === "service" ? "Service" : "Product"} · ${item.status.toLowerCase()}`,
      title: item.name,
      type: "catalog_item",
    })
  }

  const customerKeys = new Set<string>()
  for (const customer of customers) {
    const identity = customerIdentity({
      customerEmail: customer.email,
      customerName: customer.name,
      customerPhone: customer.phone,
    })
    if (identity) customerKeys.add(identity)
    results.push({
      createdAt: customer.createdAt,
      customerEmail: customer.email,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      id: `customer:${customer.id}`,
      orderId: null,
      subtitle: customer.phone ?? customer.email ?? "Saved customer",
      title: customer.name,
      type: "customer",
    })
  }

  for (const order of customerOrders) {
    const identity = customerIdentity(order)
    if (!identity || customerKeys.has(identity)) continue
    customerKeys.add(identity)
    const customerName =
      order.customerName ??
      order.customerPhone ??
      order.customerEmail ??
      "Order customer"
    results.push({
      createdAt: order.createdAt,
      customerEmail: order.customerEmail,
      customerId: null,
      customerName,
      customerPhone: order.customerPhone,
      id: `order_customer:${order.id}`,
      orderId: order.id,
      subtitle: order.customerPhone ?? order.customerEmail ?? "Order customer",
      title: customerName,
      type: "customer",
    })
  }

  for (const order of orders) {
    results.push({
      createdAt: order.createdAt,
      id: `order:${order.id}`,
      orderId: order.id,
      subtitle: `${order.customerName ?? "Walk-in customer"} · ${order.paymentStatus.toLowerCase().replaceAll("_", " ")}`,
      title: order.orderNumber,
      type: "order",
    })
  }

  for (const member of staff) {
    results.push({
      createdAt: member.createdAt,
      id: `staff:${member.user.id}`,
      staffUserId: member.user.id,
      subtitle: `${member.role.toLowerCase()} · ${member.status.toLowerCase()}`,
      title: member.user.displayName || member.user.name || member.user.email,
      type: "staff",
    })
  }

  for (const job of serviceJobs) {
    results.push({
      createdAt: job.createdAt,
      id: `service_job:${job.id}`,
      orderId: job.commercialOrderId,
      serviceJobId: job.id,
      subtitle: `${job.commercialOrder.orderNumber} · ${job.commercialOrder.customerName ?? "Walk-in customer"}`,
      title: `Service job ${job.id.slice(-6).toUpperCase()}`,
      type: "service_job",
    })
  }

  const normalizedQuery = normalize(query)
  const counts = new Map<GlobalSearchResult["type"], number>()
  return results
    .sort((left, right) => {
      const rank =
        resultRank(left, normalizedQuery) - resultRank(right, normalizedQuery)
      if (rank !== 0) return rank
      return right.createdAt.getTime() - left.createdAt.getTime()
    })
    .filter((result) => {
      const count = counts.get(result.type) ?? 0
      if (count >= perTypeLimit) return false
      counts.set(result.type, count + 1)
      return true
    })
    .slice(0, 30)
}
