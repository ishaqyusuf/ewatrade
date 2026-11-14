import { CustomerLedgerDirectory } from "@/components/customer-ledger/customer-ledger-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient } from "@/trpc/server"
import { redirect } from "next/navigation"

export const metadata = { title: "Customer balances | EwaTrade" }

export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/")
  const tenant = await getActiveTenant(session.user.id)
  if (
    !tenant ||
    !["OWNER", "ADMIN"].includes(tenant.membership.role.toUpperCase())
  )
    redirect("/")
  return (
    <HydrateClient>
      <CustomerLedgerDirectory key={`${session.user.id}:${tenant.tenant.id}`} />
    </HydrateClient>
  )
}
