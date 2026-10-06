import {
  StoresDirectory,
  StoresSkeleton,
} from "@/components/stores/stores-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function StoresSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!ctx) redirect("/login")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  void prefetch(trpc.tenant.stores.queryOptions())
  return (
    <HydrateClient>
      <Suspense fallback={<StoresSkeleton />}>
        <StoresDirectory />
      </Suspense>
    </HydrateClient>
  )
}
