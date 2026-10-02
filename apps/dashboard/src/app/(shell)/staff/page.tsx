import { PageLoading } from "@/components/dashboard/page-loading"
import { StaffContent } from "@/components/dashboard/staff-content"
import { loadStaffDirectoryParams } from "@/hooks/staff-directory-params"
import { getServerSession } from "@/lib/session"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function StaffRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (!canManageStaff(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const { staffQuery, staffRole, staffStatus } =
    await loadStaffDirectoryParams(searchParams)

  return (
    <Suspense fallback={<PageLoading />}>
      <StaffContent
        store={store}
        tenantId={ctx.tenant.id}
        search={staffQuery}
        role={staffRole}
        status={staffStatus}
      />
    </Suspense>
  )
}
