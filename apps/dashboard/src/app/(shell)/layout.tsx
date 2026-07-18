import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { getCatalogFeatureAvailability } from "@/lib/catalog-capabilities"
import {
  canAccessDashboardPath,
  getDashboardNavigation,
} from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function ShellLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getServerSession()
  const headerStore = await headers()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  // No store yet: first-time setup.
  if (ctx && ctx.stores.length === 0) {
    redirect("/setup")
  }

  // No tenant membership found: account issue.
  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  const pathname = headerStore.get("x-pathname") ?? "/"
  const store = ctx.activeStore ?? ctx.stores[0]
  if (!store) {
    redirect("/setup")
  }
  const catalogFeatures = await getCatalogFeatureAvailability({
    storeId: store.id,
    tenantId: ctx.tenant.id,
  })

  if (!canAccessDashboardPath(pathname, ctx.membership.role, catalogFeatures)) {
    redirect("/")
  }

  const navItems = getDashboardNavigation(ctx.membership.role, catalogFeatures)

  return (
    <div className="min-h-screen bg-muted/30">
      <DashboardSidebar user={session.user} ctx={ctx} navItems={navItems} />
      <div className="min-h-screen md:pl-[70px]">
        <DashboardHeader user={session.user} ctx={ctx} navItems={navItems} />
        <main className="flex min-h-[calc(100vh-70px)] flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
