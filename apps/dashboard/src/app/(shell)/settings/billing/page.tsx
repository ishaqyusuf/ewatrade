import { RetailOpsSubscriptionSettings } from "@/components/dashboard/retail-ops-subscription-settings"
import { AssistantAllowance } from "@/components/product-assistant/assistant-allowance"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "Plan and billing | EwaTrade" }

export default async function BillingSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")

  return (
    <div className="grid min-w-0 gap-7">
      <RetailOpsSubscriptionSettings />
      <AssistantAllowance />
    </div>
  )
}
