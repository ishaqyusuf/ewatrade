import { StaffPage } from "@/components/dashboard/staff-page"
import { getDashboardStaff } from "@/lib/staff-data"
import type { TenantStore } from "@/lib/tenant"

export async function StaffContent({
  businessName,
  canManageAccess,
  canOpenMember,
  store,
  stores,
  storeAccessReady,
  tenantId,
}: {
  businessName: string
  canManageAccess: boolean
  canOpenMember: boolean
  store: TenantStore
  stores: Array<{ id: string; name: string }>
  storeAccessReady: boolean
  tenantId: string
}) {
  // Everyone loads once; search and status filter on the page.
  const staff = await getDashboardStaff({ status: "all", tenantId })
  return (
    <StaffPage
      key={`${tenantId}:${store.id}`}
      businessName={businessName}
      canManageAccess={canManageAccess}
      canOpenMember={canOpenMember}
      initialStaff={staff}
      store={store}
      stores={stores}
      storeAccessReady={storeAccessReady}
    />
  )
}
