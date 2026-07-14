import { StaffPage } from "@/components/dashboard/staff-page"
import { getServerSession } from "@/lib/session"
import { getDashboardStaff } from "@/lib/staff-data"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function StaffRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canManageStaff(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const staff = await getDashboardStaff({
    tenantId: ctx.tenant.id,
  })

  return <StaffPage initialStaff={staff} store={store} />
}
