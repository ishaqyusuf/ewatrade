import { PharmacyComplianceSetup } from "@/components/compliance/pharmacy-compliance-setup"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
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

  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")

  await prefetch(
    trpc.prescriptions.setup.queryOptions({ storeId: store.id }),
  ).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<PharmacyComplianceSkeleton />}>
        <PharmacyComplianceSetup storeId={store.id} storeName={store.name} />
      </Suspense>
    </HydrateClient>
  )
}

function PharmacyComplianceSkeleton() {
  return (
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
