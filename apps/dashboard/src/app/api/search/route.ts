import { getCatalogFeatureAvailability } from "@/lib/catalog-capabilities"
import type { DashboardSearchResult } from "@/lib/dashboard-search"
import { canOperateInventory } from "@/lib/inventory-operations"
import { canManageProductCatalog } from "@/lib/product-catalog"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { canUseShareLinks } from "@/lib/share-links-operations"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  getRetailOpsCustomerBook,
  listRetailOpsProductShareLinks,
  listRetailOpsRecentSales,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

function result(input: DashboardSearchResult): DashboardSearchResult {
  return input
}

async function getSearchContext(requestedStoreId?: string) {
  const session = await getServerSession()

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    return {
      error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }),
    }
  }

  const store = requestedStoreId
    ? ctx.stores.find((item) => item.id === requestedStoreId)
    : (ctx.activeStore ?? ctx.stores[0] ?? null)

  if (!store) {
    return {
      error: NextResponse.json(
        { error: "Create a store before searching dashboard records." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim() ?? ""
  const storeId = url.searchParams.get("storeId") ?? undefined
  const searchContext = await getSearchContext(storeId)

  if ("error" in searchContext) return searchContext.error

  if (query.length < 2) {
    return NextResponse.json({ query, results: [] })
  }

  const { ctx, session, store } = searchContext
  const role = ctx.membership.role
  const tenantId = ctx.tenant.id
  const storeScope = { storeId: store.id, tenantId }
  const catalogFeatures = await getCatalogFeatureAvailability(storeScope)
  const canSearchProducts =
    canManageProductCatalog(role) || canOperateInventory(role)
  const canSearchCustomers = canUseSalesOperations(role)
  const canSearchSales = canSearchCustomers && catalogFeatures.hasProductItems
  const canSearchLinks = canUseShareLinks(role)
  const canSearchStaff = canManageStaff(role)
  const canManageAllSales = ["OWNER", "ADMIN", "MANAGER"].includes(
    role.trim().toUpperCase(),
  )
  const actorUserId = canManageAllSales ? undefined : session.user.id

  const [products, customers, staff, sales, links] = await Promise.all([
    canSearchProducts
      ? prisma.product.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            name: true,
            slug: true,
            status: true,
          },
          take: 8,
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { slug: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
            status: { not: "ARCHIVED" },
            ...storeScope,
          },
        })
      : [],
    canSearchCustomers
      ? getRetailOpsCustomerBook(prisma, {
          actorUserId,
          limit: 8,
          search: query,
          ...storeScope,
        })
      : [],
    canSearchStaff
      ? prisma.membership.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            role: true,
            status: true,
            user: {
              select: {
                displayName: true,
                email: true,
                name: true,
              },
            },
          },
          take: 8,
          where: {
            OR: [
              {
                user: { displayName: { contains: query, mode: "insensitive" } },
              },
              { user: { email: { contains: query, mode: "insensitive" } } },
              { user: { name: { contains: query, mode: "insensitive" } } },
            ],
            role: { in: ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"] },
            status: { not: "REMOVED" },
            tenantId,
          },
        })
      : [],
    canSearchSales
      ? listRetailOpsRecentSales(prisma, {
          actorUserId,
          limit: 8,
          ...storeScope,
        })
      : [],
    canSearchLinks ? listRetailOpsProductShareLinks(prisma, storeScope) : [],
  ])

  const normalizedQuery = query.toLowerCase()
  const results = [
    ...products.map((product) =>
      result({
        description: `${product.status} ${product.kind.toLowerCase()} item`,
        group: "products",
        href: `/catalog?search=${encodeURIComponent(product.name)}`,
        id: `product:${product.id}`,
        title: product.name,
      }),
    ),
    ...customers.map((customer) =>
      result({
        description:
          customer.phone ?? customer.email ?? `${customer.orderCount} orders`,
        group: "customers",
        href: `/customers?search=${encodeURIComponent(customer.name)}`,
        id: `customer:${customer.id}`,
        title: customer.name,
      }),
    ),
    ...staff.map((member) =>
      result({
        description: `${member.role} / ${member.status}`,
        group: "staff",
        href: `/staff?search=${encodeURIComponent(member.user.email)}`,
        id: `staff:${member.id}`,
        title: member.user.displayName || member.user.name || member.user.email,
      }),
    ),
    ...sales
      .filter((sale) =>
        [
          sale.orderNumber,
          sale.customer.name ?? "",
          sale.customer.email ?? "",
          sale.customer.phone ?? "",
          sale.status,
          sale.paymentStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .map((sale) =>
        result({
          description: `${sale.paymentStatus} sale`,
          group: "sales",
          href: `/sales?search=${encodeURIComponent(sale.orderNumber)}`,
          id: `sale:${sale.id}`,
          title: sale.orderNumber,
        }),
      ),
    ...links
      .filter((link) =>
        [link.label ?? "", link.product.name, link.token, link.url]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, 8)
      .map((link) =>
        result({
          description: link.active ? "Active generated link" : "Inactive link",
          group: "links",
          href: `/links?search=${encodeURIComponent(link.product.name)}`,
          id: `link:${link.id}`,
          title: link.label ?? link.product.name,
        }),
      ),
  ].slice(0, 30)

  return NextResponse.json({ query, results })
}
