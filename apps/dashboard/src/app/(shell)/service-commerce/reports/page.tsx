import { ReportTimeZoneProvider } from "@/components/reports/report-time-zone"
import {
  ServiceCommerceReportSkeleton,
  ServiceCommerceReportWorkspace,
} from "@/components/service-commerce/reports/service-commerce-report-workspace"
import {
  loadServiceCommerceReportParams,
  resolveServiceCommerceReportRange,
} from "@/hooks/use-service-commerce-report-params"
import { reportRangeInstants } from "@/lib/report-range"
import { canManageSalesReports } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Requests and quotes | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ServiceCommerceReportsPage({
  searchParams,
}: Props) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  if (!canManageSalesReports(ctx.membership.role)) redirect("/")
  if (ctx.stores.length === 0) redirect("/setup")

  const params = await loadServiceCommerceReportParams(searchParams)
  // Business days, so "Today" matches the Overview.
  const timeZone = ctx.tenant.timezone ?? "UTC"
  const range = resolveServiceCommerceReportRange(params, new Date(), timeZone)
  const window = reportRangeInstants(range, timeZone)
  const storeId = ctx.stores.some((store) => store.id === params.store)
    ? params.store
    : undefined

  void prefetch(
    trpc.serviceCommerce.report.queryOptions({
      end: window.to,
      ...(storeId ? { storeId } : {}),
      start: window.from,
    }),
  ).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<ServiceCommerceReportSkeleton />}>
        <ReportTimeZoneProvider timeZone={timeZone}>
          <ServiceCommerceReportWorkspace
            initialRange={range}
            stores={ctx.stores.map((store) => ({
              id: store.id,
              name: store.name,
            }))}
          />
        </ReportTimeZoneProvider>
      </Suspense>
    </HydrateClient>
  )
}
