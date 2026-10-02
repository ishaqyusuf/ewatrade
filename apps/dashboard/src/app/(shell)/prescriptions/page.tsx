import { WorkspaceError } from "@/components/dashboard/workspace-error"
import { PrescriptionRequestsPage } from "@/components/prescriptions/prescription-requests-page"
import { PrescriptionTableSkeleton } from "@/components/tables/prescriptions/skeleton"
import { loadPrescriptionFilterParams } from "@/hooks/use-prescription-filter-params"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import type { Metadata } from "next"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Prescription Requests | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PrescriptionsRoutePage({ searchParams }: Props) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")
  const store = ctx.activeStore ?? ctx.stores[0] ?? null
  if (!store) redirect("/setup")
  const membershipRole = normalizeRole(ctx.membership.role)
  const canManagePrescriptionSetup = Boolean(
    membershipRole && canManageTenant(membershipRole),
  )

  const [filter, initialSettings] = await Promise.all([
    loadPrescriptionFilterParams(searchParams),
    getInitialTableSettings("prescriptions", {
      userId: session.user.id,
      tenantId: ctx.tenant.id,
    }),
  ])
  const queryClient = getQueryClient()
  const accessOptions = trpc.prescriptions.workspaceAccess.queryOptions({
    storeId: store.id,
  })
  await queryClient.prefetchQuery(accessOptions)
  const access = queryClient.getQueryData(accessOptions.queryKey)
  void Promise.all([
    ...(canManagePrescriptionSetup
      ? [
          queryClient.prefetchQuery(
            trpc.prescriptions.setup.queryOptions({ storeId: store.id }),
          ),
        ]
      : []),
    ...(access?.canAccess
      ? [
          queryClient.prefetchQuery(
            trpc.prescriptions.queueContext.queryOptions({ storeId: store.id }),
          ),
          queryClient.prefetchInfiniteQuery(
            trpc.prescriptions.queue.infiniteQueryOptions(
              {
                assignees: filter.assignees,
                from: filter.from,
                pageSize: 25,
                q: filter.q,
                sort: filter.sort,
                sources: filter.sources,
                statuses: filter.statuses,
                storeId: store.id,
                to: filter.to,
              },
              {
                getNextPageParam: (lastPage) =>
                  lastPage.meta.cursor ?? undefined,
                retry: false,
              },
            ),
          ),
        ]
      : []),
  ]).catch(() => undefined)

  return (
    <HydrateClient>
      <ErrorBoundary errorComponent={WorkspaceError}>
        <Suspense
          fallback={
            <PrescriptionTableSkeleton initialSettings={initialSettings} />
          }
        >
          <PrescriptionRequestsPage
            canManageSetup={canManagePrescriptionSetup}
            store={{ id: store.id, name: store.name }}
            timeZone={ctx.tenant.timezone}
            initialSettings={initialSettings}
          />
        </Suspense>
      </ErrorBoundary>
    </HydrateClient>
  )
}
