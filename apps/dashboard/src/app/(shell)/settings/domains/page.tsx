import { DomainHeader } from "@/components/domains/domain-header"
import { DomainDataTable } from "@/components/tables/domains/data-table"
import { DomainTableSkeleton } from "@/components/tables/domains/skeleton"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default async function DomainsSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!session || !ctx) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0]

  if (!store) {
    redirect("/setup")
  }

  await Promise.all([
    prefetch(trpc.domains.list.queryOptions({})),
    prefetch(trpc.domains.registrantProfile.queryOptions()),
  ])

  return (
    <HydrateClient>
      <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
        <DomainHeader storeName={store.name} />
        <Suspense fallback={<DomainTableSkeleton />}>
          <DomainDataTable />
        </Suspense>
      </div>
    </HydrateClient>
  )
}
