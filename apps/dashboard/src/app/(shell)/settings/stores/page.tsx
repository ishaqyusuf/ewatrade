import {
  StoresDirectory,
  StoresSkeleton,
} from "@/components/stores/stores-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { getInitialDirectoryView } from "@/utils/directory-views"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function StoresSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/login")
  const role = normalizeRole(ctx.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  void prefetch(trpc.tenant.stores.queryOptions())
  const initialViewSettings = await getInitialDirectoryView("stores", {
    userId: session.user.id,
    tenantId: ctx.tenant.id,
  })
  return (
    <HydrateClient>
      <Suspense fallback={<StoresSkeleton />}>
        <StoresDirectory initialViewSettings={initialViewSettings} />
      </Suspense>
    </HydrateClient>
  )
}
