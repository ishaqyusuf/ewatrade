import { PaymentsToCheck } from "@/components/business-banking/payments-to-check"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "Payments to check | EwaTrade" }

/** Staff who take payments check customer claims here; Finance stays Owner/Admin. */
export default async function Page() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const tenant = await getActiveTenant(session.user.id)
  if (!tenant || !canUseSalesOperations(tenant.membership.role)) redirect("/")
  return (
    <PaymentsToCheck
      timeZone={tenant.tenant.timezone}
      showFinanceMenu={["OWNER", "ADMIN"].includes(
        tenant.membership.role.toUpperCase(),
      )}
    />
  )
}
