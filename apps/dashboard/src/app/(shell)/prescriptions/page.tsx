import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PrescriptionRequestsPage } from "@/components/prescriptions/prescription-requests-page"
import { PrescriptionTableSkeleton } from "@/components/tables/prescriptions/skeleton"
import { loadPrescriptionFilterParams } from "@/hooks/use-prescription-filter-params"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { redirect } from "next/navigation"
import { Suspense } from "react"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata: Metadata = {
  title: "Prescription Requests | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PrescriptionsRoutePage({ searchParams }: Props) {
  const session = await getServerSession()
  if (!session) redirect(`${MARKETING_URL}/login`)
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect(`${MARKETING_URL}/login?error=no_tenant`)
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0] ?? null
  if (!store) redirect("/setup")

  const filter = await loadPrescriptionFilterParams(searchParams)
  await getQueryClient()
    .prefetchInfiniteQuery(
      trpc.prescriptions.queue.infiniteQueryOptions(
        {
          pageSize: 25,
          q: filter.q,
          sort: filter.sort,
          sources: filter.sources,
          statuses: filter.statuses,
          storeId: store.id,
        },
        {
          getNextPageParam: (lastPage) => lastPage.meta.cursor ?? undefined,
          retry: false,
        },
      ),
    )
    .catch(() => undefined)

  return (
    <HydrateClient>
      <ErrorBoundary errorComponent={WorkspaceError}>
        <Suspense fallback={<PrescriptionTableSkeleton />}>
          <PrescriptionRequestsPage
            store={{ id: store.id, name: store.name }}
            timeZone={ctx.tenant.timezone}
          />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  )
}
