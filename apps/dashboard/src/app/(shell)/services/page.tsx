import { ServiceJobsPage } from "@/components/dashboard/service-jobs-page"
import { ServiceWorkTableSkeleton } from "@/components/tables/service-work/skeleton"
import {
  getTableSort,
  loadSortParams,
  serviceWorkSortFields,
} from "@/hooks/sort-params"
import {
  getServiceWorkQueuePageInput,
  loadServiceWorkFilterParams,
} from "@/hooks/use-service-work-filter-params"
import {
  canManageSalesReports,
  canUseSalesOperations,
} from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, prefetch, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Service Work | EwaTrade",
}

export default async function ServicesRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }
  const params = await searchParams
  const filter = await loadServiceWorkFilterParams(params)
  const sort = getTableSort(
    (await loadSortParams(params)).sort,
    serviceWorkSortFields,
  )
  const initialSettings = await getInitialTableSettings("service-work", {
    userId: session.user.id,
    tenantId: ctx.tenant.id,
  })
  const queryClient = getQueryClient()
  const canManage = canManageSalesReports(ctx.membership.role)
  void Promise.allSettled([
    ...(params.serviceSheet === "intake" || params.serviceSheet === "request"
      ? [prefetch(trpc.catalog.listItems.queryOptions({ kind: "service" }))]
      : []),
    queryClient.prefetchInfiniteQuery(
      trpc.services.queuePage.infiniteQueryOptions(
        { ...getServiceWorkQueuePageInput(filter), storeId: store.id, sort },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          retry: false,
        },
      ),
    ),
    ...(canManage
      ? [
          prefetch(
            trpc.serviceAccess.requestForms.queryOptions({ storeId: store.id }),
          ),
          prefetch(
            trpc.serviceAccess.requests.queryOptions({
              limit: 100,
              storeId: store.id,
            }),
          ),
        ]
      : []),
  ])

  return (
    <HydrateClient>
      <Suspense
        fallback={
          <ServiceWorkTableSkeleton
            initialSettings={initialSettings}
            canManage={canManage}
          />
        }
      >
        <ServiceJobsPage
          initialSettings={initialSettings}
          canManage={canManage}
          timeZone={ctx.tenant.timezone}
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
