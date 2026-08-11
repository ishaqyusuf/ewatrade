import {
  ServiceCommerceReportSkeleton,
  ServiceCommerceReportWorkspace,
} from "@/components/service-commerce/reports/service-commerce-report-workspace"
import {
  loadServiceCommerceReportParams,
  resolveServiceCommerceReportRange,
} from "@/hooks/use-service-commerce-report-params"
import { canManageSalesReports } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Service Commerce reports | EwaTrade",
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
  const range = resolveServiceCommerceReportRange(params)
  const storeId = ctx.stores.some((store) => store.id === params.store)
    ? params.store
    : undefined

  await prefetch(
    trpc.serviceCommerce.report.queryOptions({
      end: range.to,
      ...(storeId ? { storeId } : {}),
      start: range.from,
    }),
  ).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<ServiceCommerceReportSkeleton />}>
        <ServiceCommerceReportWorkspace
          initialRange={range}
          stores={ctx.stores.map((store) => ({
            id: store.id,
            name: store.name,
          }))}
        />
      </Suspense>
    </HydrateClient>
  )
}
