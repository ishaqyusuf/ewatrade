import { RetailOpsReports } from "@/components/dashboard/retail-ops-reports"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function AnalyticsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  return (
    <RetailOpsReports
      tenant={{
        name: ctx.tenant.name,
        slug: ctx.tenant.slug,
      }}
      stores={ctx.stores.map((store) => ({
        currencyCode: store.currencyCode,
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
      }))}
      defaultStoreId={ctx.activeStore?.id ?? ctx.stores[0]?.id ?? null}
    />
  )
}
