import { LinksPage } from "@/components/dashboard/links-page"
import { getServerSession } from "@/lib/session"
import { getDashboardShareLinks } from "@/lib/share-links-data"
import { canUseShareLinks } from "@/lib/share-links-operations"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function LinksRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canUseShareLinks(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const data = await getDashboardShareLinks({
    role: ctx.membership.role,
    storeId: store.id,
    tenantId: ctx.tenant.id,
    userId: session.user.id,
  })

  return <LinksPage initialData={data} store={store} />
}
