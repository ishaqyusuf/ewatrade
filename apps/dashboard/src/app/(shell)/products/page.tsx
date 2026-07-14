import { ProductsPage } from "@/components/dashboard/products-page"
import {
  type ProductCatalogItem,
  canManageProductCatalog,
} from "@/lib/product-catalog"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

function getImageUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null

  const retailOps = (metadata as { retailOps?: unknown }).retailOps
  if (!retailOps || typeof retailOps !== "object") return null

  const imageUrl = (retailOps as { imageUrl?: unknown }).imageUrl
  return typeof imageUrl === "string" && imageUrl ? imageUrl : null
}

export default async function ProductsRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canManageProductCatalog(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      currencyCode: true,
      description: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      status: true,
      updatedAt: true,
      variants: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          inventoryItem: {
            select: {
              onHandQuantity: true,
            },
          },
          isDefault: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
      },
    },
    take: 100,
    where: {
      status: { not: "ARCHIVED" },
      storeId: store.id,
      tenantId: ctx.tenant.id,
    },
  })
  const histories = products.length
    ? await prisma.productUnitPriceHistory.findMany({
        orderBy: { effectiveAt: "desc" },
        select: {
          effectiveAt: true,
          id: true,
          priceMinor: true,
          previousPriceMinor: true,
          productId: true,
          reason: true,
        },
        take: 100,
        where: {
          productId: { in: products.map((product) => product.id) },
          storeId: store.id,
          tenantId: ctx.tenant.id,
        },
      })
    : []
  const historyByProduct = new Map<string, typeof histories>()

  for (const history of histories) {
    const existing = historyByProduct.get(history.productId) ?? []
    if (existing.length < 3) {
      existing.push(history)
      historyByProduct.set(history.productId, existing)
    }
  }

  const initialProducts: ProductCatalogItem[] = products.map((product) => ({
    currencyCode: product.currencyCode,
    description: product.description,
    id: product.id,
    imageUrl: getImageUrl(product.metadata),
    name: product.name,
    priceHistory: (historyByProduct.get(product.id) ?? []).map((history) => ({
      effectiveAt: history.effectiveAt.toISOString(),
      id: history.id,
      priceMinor: history.priceMinor,
      previousPriceMinor: history.previousPriceMinor,
      reason: history.reason,
    })),
    slug: product.slug,
    status: product.status,
    units: product.variants.map((variant) => ({
      id: variant.id,
      isDefault: variant.isDefault,
      name: variant.name,
      onHandQuantity: variant.inventoryItem?.onHandQuantity ?? 0,
      priceMinor: variant.priceMinor,
      sku: variant.sku,
    })),
    updatedAt: product.updatedAt.toISOString(),
  }))

  return (
    <ProductsPage
      initialProducts={initialProducts}
      store={{
        currencyCode: store.currencyCode,
        id: store.id,
        name: store.name,
      }}
    />
  )
}
