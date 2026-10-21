import { ServiceRequestsPage } from "@/components/dashboard/service-requests-page"
import {
  canManageSalesReports,
  canUseSalesOperations,
} from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Customer requests | EwaTrade",
}

export default async function ServiceRequestsRoutePage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")
  // Requests and quotes are manager work; others go back to their jobs.
  if (!canManageSalesReports(ctx.membership.role)) redirect("/services")
  const store = ctx.activeStore ?? ctx.stores[0] ?? null
  if (!store) redirect("/setup")
  void Promise.allSettled([
    prefetch(
      trpc.serviceAccess.requests.queryOptions({
        limit: 100,
        storeId: store.id,
      }),
    ),
    prefetch(
      trpc.serviceAccess.requestForms.queryOptions({ storeId: store.id }),
    ),
  ])
  return (
    <HydrateClient>
      <ServiceRequestsPage
        store={{
          currencyCode: store.currencyCode,
          id: store.id,
          name: store.name,
        }}
        timeZone={ctx.tenant.timezone}
      />
    </HydrateClient>
  )
}
