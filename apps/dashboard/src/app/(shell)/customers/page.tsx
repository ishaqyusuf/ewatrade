import { CustomersContent } from "@/components/dashboard/customers-content"
import { PageLoading } from "@/components/dashboard/page-loading"
import { loadCustomerDirectoryParams } from "@/hooks/customer-directory-params"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getInitialTableSettings } from "@/utils/columns"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function CustomersRoutePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    redirect("/login?error=no_tenant")
  }

  if (!canUseSalesOperations(ctx.membership.role)) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0] ?? null

  if (!store) {
    redirect("/setup")
  }

  const { customerQuery } = await loadCustomerDirectoryParams(searchParams)

  return (
    <Suspense fallback={<PageLoading />}>
      <CustomersContent
        store={store}
        role={ctx.membership.role}
        tenantId={ctx.tenant.id}
        userId={session.user.id}
        search={customerQuery}
        initialSettings={
          await getInitialTableSettings("customers", {
            userId: session.user.id,
            tenantId: ctx.tenant.id,
          })
        }
      />
    </Suspense>
  )
}
