import {
  type DashboardDeliveryRequest,
  type DashboardProductShareLink,
  type DashboardShareableProduct,
  type DashboardSharedLinkOrderRequest,
  canManageAllShareLinks,
} from "@/lib/share-links-operations"
import { prisma } from "@ewatrade/db"
import {
  listRetailOpsDeliveryRequests,
  listRetailOpsProductShareLinks,
  listRetailOpsSharedLinkOrderRequests,
} from "@ewatrade/db/queries"

function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function getDashboardShareLinks(input: {
  orderStatus?: "all" | "cancelled" | "completed" | "pending"
  role: string
  storeId: string
  tenantId: string
  userId: string
}) {
  const canManageAll = canManageAllShareLinks(input.role)
  const [links, orders, deliveries, products] = await Promise.all([
    listRetailOpsProductShareLinks(prisma, {
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    listRetailOpsSharedLinkOrderRequests(prisma, {
      actorUserId: input.userId,
      canManageAllRequests: canManageAll,
      limit: 75,
      status: input.orderStatus ?? "pending",
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    listRetailOpsDeliveryRequests(prisma, {
      actorUserId: input.userId,
      canManageAllRequests: canManageAll,
      limit: 75,
      status: "all",
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        variants: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            isDefault: true,
            name: true,
            priceMinor: true,
            sku: true,
          },
        },
      },
      take: 100,
      where: {
        status: "ACTIVE",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])

  return {
    deliveries: toJson<DashboardDeliveryRequest[]>(deliveries),
    links: toJson<DashboardProductShareLink[]>(links),
    orders: toJson<DashboardSharedLinkOrderRequest[]>(orders),
    products: toJson<DashboardShareableProduct[]>(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        units: product.variants,
      })),
    ),
  }
}
