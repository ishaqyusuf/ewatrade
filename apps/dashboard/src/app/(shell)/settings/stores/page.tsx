import {
  StoresDirectory,
  StoresSkeleton,
} from "@/components/stores/stores-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { prisma } from "@ewatrade/db"
import { getRetailOpsTenantPlan } from "@ewatrade/db/retail-ops-subscriptions"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata = { title: "Stores | EwaTrade" }

export default async function StoresSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/login")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  void prefetch(trpc.tenant.stores.queryOptions())
  // Only the store allowance; the usage counts live on Plan and billing.
  const storeLimit = await getRetailOpsTenantPlan(prisma, {
    tenantId: ctx.tenant.id,
  }).then(
    ({ plan }) => ({ limit: plan.limits.businesses, planName: plan.name }),
    () => null,
  )
  return (
    <HydrateClient>
      <Suspense fallback={<StoresSkeleton />}>
        <StoresDirectory storeLimit={storeLimit} />
      </Suspense>
    </HydrateClient>
  )
}
