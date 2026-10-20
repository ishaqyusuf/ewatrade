import { StaffPage } from "@/components/dashboard/staff-page"
import { getDashboardStaff } from "@/lib/staff-data"
import type { StaffRoleFilter } from "@/lib/staff-management"
import type { TenantStore } from "@/lib/tenant"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"

export async function StaffContent({
  businessName,
  canManageAccess,
  canOpenMember,
  initialViewSettings,
  store,
  tenantId,
  search,
  role,
}: {
  businessName: string
  canManageAccess: boolean
  canOpenMember: boolean
  initialViewSettings: DirectoryViewSettings
  store: TenantStore
  tenantId: string
  search: string
  role: StaffRoleFilter
}) {
  // Every status loads; the status tabs filter on the page.
  const staff = await getDashboardStaff({
    role,
    search: search.trim() || undefined,
    status: "all",
    tenantId,
  })
  return (
    <StaffPage
      key={`${tenantId}:${store.id}`}
      businessName={businessName}
      canManageAccess={canManageAccess}
      canOpenMember={canOpenMember}
      initialViewSettings={initialViewSettings}
      initialStaff={staff}
      initialQuery={search}
      initialRole={role}
      store={store}
    />
  )
}
