import { ServiceJobsPage } from "@/components/dashboard/service-jobs-page"
import { ServiceWorkTableSkeleton } from "@/components/tables/service-work/skeleton"
import { getCatalogFeatureAvailability } from "@/lib/catalog-capabilities"
import {
  canManageSalesReports,
  canUseSalesOperations,
} from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata: Metadata = {
  title: "Service Work | EwaTrade",
}

export default async function ServicesRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }
  const catalogFeatures = await getCatalogFeatureAvailability({
    storeId: store.id,
    tenantId: ctx.tenant.id,
  })
  if (!catalogFeatures.hasServiceItems) {
    redirect("/")
  }
  const canManage = canManageSalesReports(ctx.membership.role)
  await Promise.allSettled([
    prefetch(trpc.catalog.listItems.queryOptions({ kind: "service" })),
    prefetch(
      trpc.services.queue.queryOptions({ limit: 200, storeId: store.id }),
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
      <Suspense fallback={<ServiceWorkTableSkeleton />}>
        <ServiceJobsPage
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
