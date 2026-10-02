import { CustomerLedgerDirectory } from "@/components/customer-ledger/customer-ledger-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { redirect } from "next/navigation"
export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/")
  const tenant = await getActiveTenant(session.user.id)
  if (
    !tenant ||
    !["OWNER", "ADMIN"].includes(tenant.membership.role.toUpperCase())
  )
    redirect("/")
  await getQueryClient().prefetchQuery(
    trpc.customers.listPage.queryOptions({ limit: 30 }),
  )
  return (
    <HydrateClient>
      <CustomerLedgerDirectory key={`${session.user.id}:${tenant.tenant.id}`} />
    </HydrateClient>
  )
}
