import {
  CustomerChannelsSkeleton,
  CustomerChannelsWorkspace,
} from "@/components/customer-channels/customer-channels-workspace"
import { loadServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import {
  HydrateClient,
  getQueryClient,
  getServerClient,
  trpc,
} from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Customer channels | EwaTrade",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CustomerChannelsPage({ searchParams }: Props) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")

  const params = await loadServiceCommerceParams(searchParams)
  const requestedStore = ctx.stores.find((store) => store.id === params.storeId)
  const store = requestedStore ?? ctx.activeStore ?? ctx.stores[0]
  if (!store) redirect("/setup")

  // One server read for the whole page, seeded into each piece's own query
  // key: components, sheets and their invalidations keep their procedures.
  // If it fails, the components read their pieces themselves.
  const snapshot = await getServerClient()
    .serviceCommerce.channelSettings.query({ storeId: store.id })
    .catch(() => null)
  if (snapshot) {
    const queryClient = getQueryClient()
    const input = { storeId: store.id }
    const seed = <T,>(queryKey: readonly unknown[], data: T) =>
      queryClient.setQueryData(queryKey, data)
    seed(
      trpc.serviceCommerce.channelWorkspace.queryKey(input),
      snapshot.workspace,
    )
    seed(
      trpc.serviceCommerce.pendingQuoteApprovals.queryKey(input),
      snapshot.pendingQuoteApprovals,
    )
    seed(
      trpc.serviceCommerce.storeConversationAvailabilitySettings.queryKey(
        input,
      ),
      snapshot.availability,
    )
    seed(
      trpc.serviceCommerce.quoteReleaseSettings.queryKey(input),
      snapshot.quoteRelease,
    )
    seed(
      trpc.serviceCommerce.storeConversationChannelModeSettings.queryKey(input),
      snapshot.channelMode,
    )
  }

  return (
    <HydrateClient>
      <Suspense fallback={<CustomerChannelsSkeleton />}>
        <CustomerChannelsWorkspace
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
