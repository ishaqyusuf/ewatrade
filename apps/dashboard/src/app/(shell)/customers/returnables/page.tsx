import { ReturnablesPage } from "@/components/returnables/returnables-page"
import {
  canReviewCustomerBalances,
  canUseSalesOperations,
} from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export default async function ReturnablesRoutePage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const ctx = await getActiveTenant(session.user.id)
  if (!ctx) redirect("/login?error=no_tenant")
  if (!canUseSalesOperations(ctx.membership.role)) redirect("/")
  return (
    <ReturnablesPage
      canSeeStatements={canReviewCustomerBalances(ctx.membership.role)}
    />
  )
}
