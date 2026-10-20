import { OperationsReports } from "@/components/dashboard/operations-reports"
import { loadOperationsReportParams } from "@/hooks/use-operations-report-params"
import { previousReportRange } from "@/lib/report-range"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Reports | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AnalyticsPage({ searchParams }: Props) {
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
  const { range } = await loadOperationsReportParams(searchParams)
  const previous = previousReportRange(range)
  void Promise.allSettled([
    prefetch(
      trpc.orders.salesReport.queryOptions({
        from: range.from,
        storeId: store.id,
        to: range.to,
      }),
    ),
    prefetch(
      trpc.orders.salesReport.queryOptions({
        from: previous.from,
        storeId: store.id,
        to: previous.to,
      }),
    ),
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
