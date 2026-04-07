import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function ShellLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  // No store yet → first-time setup
  if (ctx && ctx.stores.length === 0) {
    redirect("/setup")
  }

  // No tenant membership found → account issue
  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar user={session.user} ctx={ctx} />
      <main className="flex flex-1 flex-col overflow-y-auto bg-muted/30">
        {children}
      </main>
    </div>
  )
}
