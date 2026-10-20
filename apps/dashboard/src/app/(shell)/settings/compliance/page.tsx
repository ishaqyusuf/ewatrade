import { PharmacyComplianceWorkspace } from "@/components/compliance/pharmacy-compliance-workspace"
import { loadSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { getDashboardNavItem } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Pharmacy compliance | EwaTrade",
}

const COMPLIANCE_PATH = "/settings/compliance"

export default async function ComplianceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")

  const activeStore = ctx.activeStore ?? ctx.stores[0]
  if (!activeStore) redirect("/setup")

  // Same rule as the settings side list: only pharmacy businesses see this page.
  const navItem = getDashboardNavItem(COMPLIANCE_PATH, ctx.membership.role, {
    businessProfileKey: activeStore.businessOnboarding?.businessProfileKey,
  })
  if (navItem?.href !== COMPLIANCE_PATH) redirect("/settings")

  const stores = ctx.stores.map((store) => ({ id: store.id, name: store.name }))
  const { storeId: requestedStoreId } =
    await loadSettingsStoreParams(searchParams)
  const storeId =
    stores.find((store) => store.id === requestedStoreId)?.id ?? activeStore.id

  void Promise.all([
    prefetch(trpc.prescriptions.setup.queryOptions({ storeId })),
    prefetch(trpc.prescriptions.channelInfo.queryOptions({ storeId })),
    prefetch(trpc.prescriptions.whatsappConnections.queryOptions()),
    prefetch(trpc.prescriptions.deliveryZones.queryOptions({ storeId })),
    prefetch(trpc.prescriptions.retentionPolicy.queryOptions({ storeId })),
    prefetch(
      trpc.prescriptions.manualDeliveryReviews.queryOptions({ storeId }),
    ),
    prefetch(trpc.prescriptions.complianceEvents.queryOptions({ storeId })),
  ]).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<PharmacyComplianceSkeleton />}>
        <PharmacyComplianceWorkspace storeId={storeId} stores={stores} />
      </Suspense>
    </HydrateClient>
  )
}

function PharmacyComplianceSkeleton() {
  return (
    <div className="grid min-w-0 gap-7" aria-busy="true">
      <div className="h-16 animate-pulse rounded-[10px] bg-muted" />
      <div className="h-28 animate-pulse rounded-[10px] bg-muted" />
      <div className="h-96 animate-pulse rounded-[10px] bg-muted" />
    </div>
  )
}
