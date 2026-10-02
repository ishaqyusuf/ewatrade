import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { GlobalSheetsProvider } from "@/components/sheets/global-sheets-provider"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
} from "@/lib/navigation"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function ShellLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getServerSession()
  const headerStore = await headers()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  // No store yet: first-time setup.
  if (ctx && ctx.stores.length === 0) {
    redirect("/setup")
  }

  // No tenant membership found: account issue.
  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  const pathname = headerStore.get("x-pathname") ?? "/"
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) {
    redirect("/setup")
  }
  const navigationContext = {
    isPlatformAdmin: session.user.isPlatformAdmin,
    operatingModel: store.businessOnboarding?.operatingModel,
    businessProfileKey: store.businessOnboarding?.businessProfileKey,
  }

  if (
    !canAccessDashboardPath(pathname, ctx.membership.role, navigationContext)
  ) {
    redirect("/")
  }

  const navItems = getDashboardNavigation(
    ctx.membership.role,
    navigationContext,
  )
  const commandPaths = ["/catalog", "/staff"].filter((path) =>
    canAccessDashboardPath(path, ctx.membership.role, navigationContext),
  )
  const membershipRole = normalizeRole(ctx.membership.role)

  return (
    <div className="relative min-h-screen bg-background">
      <DashboardSidebar user={session.user} ctx={ctx} navItems={navItems} />
      <div className="min-h-screen pb-4 md:ml-[70px]">
        <DashboardHeader
          commandPaths={commandPaths}
          user={session.user}
          ctx={ctx}
          navItems={navItems}
        />
        <GlobalSheetsProvider
          access={{
            finance: ["OWNER", "ADMIN"].includes(
              ctx.membership.role.toUpperCase(),
            ),
            prescriptions: canUseSalesOperations(ctx.membership.role),
            managePrescriptionSetup: Boolean(
              membershipRole && canManageTenant(membershipRole),
            ),
          }}
          actorUserId={session.user.id}
          store={{ id: store.id, name: store.name }}
          storeIds={ctx.stores.map((item) => item.id)}
          tenantId={ctx.tenant.id}
        >
          <main className="flex min-h-[calc(100vh-70px)] min-w-0 flex-col px-4 md:px-8">
            {children}
          </main>
        </GlobalSheetsProvider>
      </div>
    </div>
  )
}
