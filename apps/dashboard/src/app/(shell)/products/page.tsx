import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import type { ProductRow } from "./_components/products-table"
import { ProductsTable } from "./_components/products-table"

export default async function ProductsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!ctx?.activeStore) return null

  const raw = await prisma.product.findMany({
    where: { storeId: ctx.activeStore.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      status: true,
      listPriceMinor: true,
      salePriceMinor: true,
      currencyCode: true,
      isPublished: true,
      isMarketplaceListed: true,
      createdAt: true,
      _count: { select: { variants: true } },
      variants: {
        where: { isActive: true },
        select: {
          inventoryItem: { select: { onHandQuantity: true } },
        },
      },
    },
  })

  // Serialize dates for client component
  const products: ProductRow[] = raw.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {products.length === 0
              ? "No products yet — add your first one."
              : `${products.length} product${products.length === 1 ? "" : "s"} · ${ctx.activeStore.name}`}
          </p>
        </div>
        <Link
          href="/products/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New product
        </Link>
      </div>

      <ProductsTable
        products={products}
        currencyCode={ctx.activeStore.currencyCode}
      />
    </div>
  )
}
