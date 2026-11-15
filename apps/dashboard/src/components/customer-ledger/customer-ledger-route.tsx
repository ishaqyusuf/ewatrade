import { PageLoading } from "@/components/dashboard/page-loading"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, getQueryClient, trpc } from "@/trpc/server"
import { getInitialTableSettings } from "@/utils/columns"
import { tableIds } from "@/utils/table-settings"
import { prisma } from "@ewatrade/db"
import {
  CUSTOMER_STATEMENT_PAGE,
  readCustomerStatementPage,
} from "@ewatrade/db/queries"
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
  await seedStatementPage({
    customerId,
    tenantId: tenant.tenant.id,
    actorUserId: session.user.id,
  })
  return (
    <HydrateClient>
      <Suspense fallback={<PageLoading />}>
        <CustomerLedgerWorkspace
          key={`${session.user.id}:${tenant.tenant.id}:${customerId}`}
          customerId={customerId}
          actorUserId={session.user.id}
          tenantId={tenant.tenant.id}
          initialSettings={initialSettings}
        />
      </Suspense>
    </HydrateClient>
  )
}

/**
 * One transaction and one Owner/Admin check for everything the statement page
 * shows first, seeded into the same query keys the components read, instead
 * of six separate reads that each open a transaction and re-check access.
 * Falls back to the accounts read alone if the combined read fails.
 */
async function seedStatementPage(input: {
  customerId: string
  tenantId: string
  actorUserId: string
}) {
  const client = getQueryClient()
  const { customerId } = input
  const accountsKey = { customerId, limit: CUSTOMER_STATEMENT_PAGE.accounts }
  try {
    const page = await readCustomerStatementPage(prisma, input)
    client.setQueryData(
      trpc.customerLedger.accounts.queryKey(accountsKey),
      page.accounts,
    )
    client.setQueryData(
      trpc.customerLedger.orderLinkSuggestions.queryKey({
        customerId,
        limit: CUSTOMER_STATEMENT_PAGE.orderLinks,
      }),
      page.orderLinks,
    )
    const accountId = page.accountId
    if (!accountId || !page.statement || !page.detail || !page.refunds) return
    const entries = CUSTOMER_STATEMENT_PAGE.entries
    client.setQueryData(
      trpc.customerLedger.statement.queryKey({ accountId, limit: entries }),
      page.statement,
    )
    client.setQueryData(
      trpc.customerLedger.statement.queryKey({
        accountId,
        snapshotSequence: page.statement.snapshotSequence,
        limit: entries,
      }),
      page.statement,
    )
    client.setQueryData(
      trpc.customerLedger.accountDetail.queryKey({ accountId }),
      page.detail,
    )
    client.setQueryData(
      trpc.customerLedger.refundRequests.queryKey({
        accountId,
        limit: CUSTOMER_STATEMENT_PAGE.refunds,
      }),
      page.refunds,
    )
    if (page.aging)
      client.setQueryData(
        trpc.customerLedger.aging.queryKey({ accountId }),
        page.aging,
      )
  } catch {
    await client.prefetchQuery(
      trpc.customerLedger.accounts.queryOptions(accountsKey),
    )
  }
}
