import { PageLoading } from "@/components/dashboard/page-loading"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { tableIds } from "@/utils/table-settings"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { CustomerLedgerWorkspace } from "./customer-ledger-workspace"
export async function CustomerLedgerRoute({
  customerId,
}: { customerId: string }) {
  const session = await getServerSession()
  if (!session) redirect("/")
  const tenant = await getActiveTenant(session.user.id)
  if (
    !tenant ||
    !["OWNER", "ADMIN"].includes(tenant.membership.role.toUpperCase())
  )
    redirect("/")
  const tableId = tableIds.find((id) => String(id) === "customer-ledger")
  const initialSettings = tableId
    ? await getInitialTableSettings(tableId, {
        userId: session.user.id,
        tenantId: tenant.tenant.id,
      })
    : undefined
  await getQueryClient().prefetchQuery(
    trpc.customerLedger.accounts.queryOptions({ customerId, limit: 50 }),
  )
  return (
    <HydrateClient>
      <Suspense fallback={<PageLoading />}>
        <CustomerLedgerWorkspace
          key={`${session.user.id}:${tenant.tenant.id}:${customerId}`}
          customerId={customerId}
          initialSettings={initialSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}
