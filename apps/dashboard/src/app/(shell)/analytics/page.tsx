import { OperationsReports } from "@/components/dashboard/operations-reports"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Reports | EwaTrade",
}

export default async function AnalyticsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")
  void Promise.allSettled([
    prefetch(
      trpc.inventory.reconciliationReport.queryOptions({ storeId: store.id }),
    ),
    prefetch(
      trpc.inventory.balanceReport.queryOptions({
        includeCompatibleTotals: true,
        storeId: store.id,
      }),
    ),
    prefetch(trpc.serviceReporting.summary.queryOptions({ storeId: store.id })),
    prefetch(trpc.orders.reportSummary.queryOptions({ storeId: store.id })),
  ])
  return (
    <HydrateClient>
      <Suspense
        fallback={
          <div className="grid min-w-0 gap-3 pt-6">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={`report-skeleton-${index + 1}`}
                className="h-20 animate-pulse rounded bg-muted"
              />
            ))}
          </div>
        }
      >
        <OperationsReports store={store} tenantName={ctx.tenant.name} />
      </Suspense>
    </HydrateClient>
  )
}
