import {
  ServiceCommerceSetup,
  ServiceCommerceSetupSkeleton,
} from "@/components/service-commerce/service-commerce-setup"
import { loadServiceCommerceSetupParams } from "@/hooks/use-service-commerce-setup-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Service Commerce | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ServiceCommerceSettingsPage({
  searchParams,
}: Props) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")

  const params = await loadServiceCommerceSetupParams(searchParams)
  const requestedStore = ctx.stores.find((store) => store.id === params.storeId)
  const store = requestedStore ?? ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")

  await prefetch(
    trpc.serviceCommerce.workspaceAccess.queryOptions({ storeId: store.id }),
  ).catch(() => undefined)

  return (
    <HydrateClient>
      <Suspense fallback={<ServiceCommerceSetupSkeleton />}>
        <ServiceCommerceSetup
          initialStoreId={store.id}
          stores={ctx.stores.map((option) => ({
            id: option.id,
            name: option.name,
          }))}
        />
      </Suspense>
    </HydrateClient>
  )
}
