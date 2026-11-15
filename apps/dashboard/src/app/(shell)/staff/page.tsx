import { PageLoading } from "@/components/dashboard/page-loading"
import { StaffContent } from "@/components/dashboard/staff-content"
import { getServerSession } from "@/lib/session"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { STAFF_STORE_ACCESS_ROLLOUT_READY } from "@ewatrade/db/queries"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function StaffRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (!canManageStaff(ctx.membership.role, ctx.membership.staffAccessMode)) {
    redirect("/")
  }

  const isAdministrator = ["OWNER", "ADMIN"].includes(ctx.membership.role)
  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  return (
    <Suspense fallback={<PageLoading />}>
      <StaffContent
        businessName={ctx.tenant.name}
        canManageAccess={isAdministrator}
        canOpenMember={
          isAdministrator ||
          (ctx.membership.role === "MANAGER" &&
            ctx.membership.staffAccessMode === "LEGACY")
        }
        store={store}
        stores={ctx.stores
          .filter((item) => item.status === "ACTIVE")
          .map((item) => ({ id: item.id, name: item.name }))}
        storeAccessReady={STAFF_STORE_ACCESS_ROLLOUT_READY}
        tenantId={ctx.tenant.id}
      />
    </Suspense>
  )
}
