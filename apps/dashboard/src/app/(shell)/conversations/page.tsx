import {
  ConversationQueueSkeleton,
  ConversationWorkspace,
} from "@/components/store-conversations/conversation-workspace"
import {
  getStoreConversationQueueInput,
  loadStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { HydrateClient, prefetch, trpc } from "@/trpc/server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Conversations | EwaTrade",
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) redirect("/")
  const activeStore = ctx.activeStore ?? ctx.stores[0]
  if (!activeStore) redirect("/setup")

  const params = await loadStoreConversationParams(searchParams)
  const selectedStore =
    params.store && ctx.stores.some((store) => store.id === params.store)
      ? params.store
      : activeStore.id
  const input = getStoreConversationQueueInput(
    { ...params, store: selectedStore },
    activeStore.id,
  )
  await prefetch(
    trpc.serviceCommerce.storeConversationQueue.queryOptions(input),
  ).catch(() => undefined)
  if (params.conversationId && params.conversationSheet === "detail") {
    await prefetch(
      trpc.serviceCommerce.storeConversationTimeline.queryOptions({
        conversationId: params.conversationId,
        limit: 50,
        storeId: selectedStore,
      }),
    ).catch(() => undefined)
  }

  return (
    <HydrateClient>
      <Suspense fallback={<ConversationQueueSkeleton />}>
        <ConversationWorkspace
          activeStoreId={activeStore.id}
          stores={ctx.stores.map((store) => ({
            id: store.id,
            name: store.name,
          }))}
        />
      </Suspense>
    </HydrateClient>
  )
}
