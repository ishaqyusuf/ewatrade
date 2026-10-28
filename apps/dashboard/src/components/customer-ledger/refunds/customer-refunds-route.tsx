import { PageLoading } from "@/components/dashboard/page-loading"
import { FINANCE_MENU_ITEMS } from "@/components/finance/finance-header"
import { PageHeader } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { SecondaryMenu } from "@/components/secondary-menu"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { CustomerRefunds } from "./customer-refunds"

/**
 * Finance → Refunds for every customer. Owner/Admin only, the same guard as
 * the customer statement; the API checks Finance access again on every read
 * and change. The first page is prefetched without destinations.
 */
export async function CustomerRefundsRoute() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  const tenant = await getActiveTenant(session.user.id)
  if (
    !tenant ||
    !["OWNER", "ADMIN"].includes(tenant.membership.role.toUpperCase())
  )
    redirect("/")
  await getQueryClient().prefetchQuery(
    trpc.customerLedger.refundRequests.queryOptions({ limit: 20 }),
  )
  return (
    <ScrollableContent>
      <div className="grid min-w-0 gap-6 pt-6 pb-24">
        <PageHeader
          eyebrow="Business money"
          title="Refunds"
          description="Customers asking for paid-ahead money back. Approving holds the money; you send it from your bank, then record it here."
        >
          <SecondaryMenu items={FINANCE_MENU_ITEMS} label="Finance" />
        </PageHeader>
        <HydrateClient>
          <Suspense fallback={<PageLoading />}>
            <CustomerRefunds
              key={`${session.user.id}:${tenant.tenant.id}`}
              actorUserId={session.user.id}
              tenantId={tenant.tenant.id}
            />
          </Suspense>
        </HydrateClient>
      </div>
    </ScrollableContent>
  )
}
