import { DomainsDirectory } from "@/components/domains/domains-directory"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import { getInitialDirectoryView } from "@/utils/directory-views"
import { redirect } from "next/navigation"

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

  void Promise.all([
    prefetch(trpc.domains.list.queryOptions({})),
    prefetch(trpc.domains.registrantProfile.queryOptions()),
  ])
  const initialViewSettings = await getInitialDirectoryView("domains", {
    userId: session.user.id,
    tenantId: ctx.tenant.id,
  })

  return (
    <HydrateClient>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <DomainsDirectory
          storeName={store.name}
          initialViewSettings={initialViewSettings}
        />
      </div>
    </HydrateClient>
  )
}
