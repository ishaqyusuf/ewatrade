import { StorefrontStudio } from "@/components/storefront/storefront-studio"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Storefront studio | EwaTrade",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

export default async function StorefrontPage() {
  const session = await getServerSession()
  const context = session ? await getActiveTenant(session.user.id) : null
  if (!session || !context) redirect("/login")
  const role = normalizeRole(context.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  if (
    !context.stores.length ||
    context.stores.some(
      (store) => store.businessOnboarding?.setupStatus === "pending",
    )
  )
    redirect("/setup")
  return (
    <StorefrontStudio
      key={context.tenant.id}
      stores={context.stores.map(({ id, name, businessOnboarding }) => ({
        id,
        name,
        operatingModel: businessOnboarding?.operatingModel ?? null,
      }))}
    />
  )
}
