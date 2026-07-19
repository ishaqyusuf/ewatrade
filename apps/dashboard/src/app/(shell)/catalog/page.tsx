import { CatalogItemsPage } from "@/components/dashboard/catalog-items-page"
import { CatalogTableSkeleton } from "@/components/tables/catalog/skeleton"
import { canManageProductCatalog } from "@/lib/product-catalog"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata: Metadata = {
  title: "Catalog | EwaTrade",
}

export default async function CatalogRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
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

  const kind =
    params.catalogKind === "product" || params.catalogKind === "service"
      ? params.catalogKind
      : undefined
  await Promise.allSettled([
    prefetch(trpc.catalog.listItems.queryOptions({})),
    prefetch(trpc.catalog.listItems.queryOptions({ kind })),
  ])

  return (
    <HydrateClient>
      <Suspense fallback={<CatalogTableSkeleton />}>
        <CatalogItemsPage
          store={{
            currencyCode: store.currencyCode,
            id: store.id,
            name: store.name,
          }}
        />
      </Suspense>
    </HydrateClient>
  )
}
