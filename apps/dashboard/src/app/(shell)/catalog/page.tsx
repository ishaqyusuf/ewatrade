import { CatalogItemsPage } from "@/components/dashboard/catalog-items-page"
import {
  catalogSortFields,
  getTableSort,
  loadSortParams,
} from "@/hooks/sort-params"
import {
  getCatalogListPageInput,
  loadCatalogFilterParams,
} from "@/hooks/use-catalog-filter-params"
import { canManageProductCatalog } from "@/lib/product-catalog"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { canStaffPerform } from "@ewatrade/auth/store-access"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

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
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (
    !(ctx.staffAccess?.mode === "SCOPED"
      ? canStaffPerform(ctx.staffAccess, "catalog")
      : canManageProductCatalog(ctx.membership.role))
  ) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const filter = await loadCatalogFilterParams(searchParams)
  const { sort: rawSort } = await loadSortParams(params)
  const sort = getTableSort(rawSort, catalogSortFields)
  const initialSettings = await getInitialTableSettings("catalog", {
    userId: session.user.id,
    tenantId: ctx.tenant.id,
  })
  const queryClient = getQueryClient()
  void Promise.allSettled([
    queryClient.prefetchInfiniteQuery(
      trpc.catalog.listItemsPage.infiniteQueryOptions(
        { ...getCatalogListPageInput(filter), sort },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          retry: false,
        },
      ),
    ),
    ...(typeof params.catalogDetail === "string" && params.catalogDetail
      ? [
          prefetch(
            trpc.catalog.detail.overview.queryOptions({
              itemId: params.catalogDetail,
              storeId: store.id,
            }),
          ),
        ]
      : []),
    ...(typeof params.productUnits === "string" && params.productUnits
      ? [prefetch(trpc.catalog.listItems.queryOptions({}))]
      : []),
  ])

  return (
    <HydrateClient>
      <CatalogItemsPage
        initialSettings={initialSettings}
        store={{
          businessProfileKey:
            store.businessOnboarding?.businessProfileKey ?? null,
          currencyCode: store.currencyCode,
          id: store.id,
          name: store.name,
        }}
      />
    </HydrateClient>
  )
}
