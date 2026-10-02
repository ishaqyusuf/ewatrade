import { StaffPage } from "@/components/dashboard/staff-page"
import { getDashboardStaff } from "@/lib/staff-data"
import type { StaffRoleFilter, StaffStatusFilter } from "@/lib/staff-management"
import type { TenantStore } from "@/lib/tenant"

export async function StaffContent({
  store,
  tenantId,
  search,
  role,
  status,
}: {
  store: TenantStore
  tenantId: string
  search: string
  role: StaffRoleFilter
  status: StaffStatusFilter
}) {
  const staff = await getDashboardStaff({
    role,
    search: search.trim() || undefined,
    status,
    tenantId,
  })
  return (
    <StaffPage
      key={`${tenantId}:${store.id}`}
      initialStaff={staff}
      initialQuery={search}
      initialRole={role}
      initialStatus={status}
      store={store}
    />
  )
}
