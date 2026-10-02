import { PharmacyComplianceWorkspace } from "@/components/compliance/pharmacy-compliance-workspace"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Pharmacy compliance | EwaTrade",
}

export default async function ComplianceSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")

  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")

  void Promise.all([
    prefetch(trpc.prescriptions.setup.queryOptions({ storeId: store.id })),
    prefetch(
      trpc.prescriptions.channelInfo.queryOptions({ storeId: store.id }),
    ),
    prefetch(trpc.prescriptions.whatsappConnections.queryOptions()),
    prefetch(
      trpc.prescriptions.deliveryZones.queryOptions({ storeId: store.id }),
    ),
    prefetch(
      trpc.prescriptions.retentionPolicy.queryOptions({ storeId: store.id }),
    ),
    prefetch(
      trpc.prescriptions.manualDeliveryReviews.queryOptions({
        storeId: store.id,
      }),
    ),
    prefetch(
      trpc.prescriptions.complianceEvents.queryOptions({ storeId: store.id }),
    ),
  ]).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<PharmacyComplianceSkeleton />}>
        <PharmacyComplianceWorkspace
          storeId={store.id}
          storeName={store.name}
        />
      </Suspense>
    </HydrateClient>
  )
}

function PharmacyComplianceSkeleton() {
  return (
    <div className="grid min-w-0 flex-1 gap-6">
      <div className="h-24 animate-pulse bg-muted" />
      <div className="h-96 animate-pulse bg-muted" />
    </div>
  )
}
