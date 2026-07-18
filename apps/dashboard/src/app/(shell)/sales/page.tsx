import { SalesPage } from "@/components/dashboard/sales-page"
import { getCatalogFeatureAvailability } from "@/lib/catalog-capabilities"
import { getDashboardSalesOperations } from "@/lib/sales-data"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function SalesRoutePage() {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect(`${MARKETING_URL}/login?error=no_tenant`)
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }
  const catalogFeatures = await getCatalogFeatureAvailability({
    storeId: store.id,
    tenantId: ctx.tenant.id,
  })
  if (!catalogFeatures.hasProductItems) {
    redirect("/")
  }

  const data = await getDashboardSalesOperations({
    role: ctx.membership.role,
    storeId: store.id,
    tenantId: ctx.tenant.id,
    userId: session.user.id,
  })

  return <SalesPage initialData={data} store={store} />
}
