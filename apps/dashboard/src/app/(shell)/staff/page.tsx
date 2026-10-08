import { PageLoading } from "@/components/dashboard/page-loading"
import { StaffContent } from "@/components/dashboard/staff-content"
import { OrderVisibilityCard } from "@/components/staff/order-visibility-card"
import { loadStaffDirectoryParams } from "@/hooks/staff-directory-params"
import { getServerSession } from "@/lib/session"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { getInitialDirectoryView } from "@/utils/directory-views"
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

  if (!canManageStaff(ctx.membership.role, ctx.membership.staffAccessMode)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const [{ staffQuery, staffRole, staffStatus }, initialViewSettings] =
    await Promise.all([
      loadStaffDirectoryParams(searchParams),
      getInitialDirectoryView("staff", {
        userId: session.user.id,
        tenantId: ctx.tenant.id,
      }),
    ])

  return (
    <div className="grid gap-6">
      {["OWNER", "ADMIN"].includes(ctx.membership.role) ? (
        <OrderVisibilityCard storeId={store.id} storeName={store.name} />
      ) : null}
      <Suspense fallback={<PageLoading />}>
        <StaffContent
          initialViewSettings={initialViewSettings}
          store={store}
          tenantId={ctx.tenant.id}
          search={staffQuery}
          role={staffRole}
          status={staffStatus}
        />
      </Suspense>
    </div>
  )
}
