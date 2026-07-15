import { DryCleaningServicesPage } from "@/components/dashboard/dry-cleaning-services-page"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export default async function ServicesRoutePage() {
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

  if (store.businessTemplateKey !== "dry_cleaning_laundry") {
    redirect("/")
  }

  return (
    <DryCleaningServicesPage
      store={{
        currencyCode: store.currencyCode,
        id: store.id,
        name: store.name,
      }}
    />
  )
}
