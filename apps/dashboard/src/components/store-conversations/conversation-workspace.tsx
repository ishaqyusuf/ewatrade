"use client"

import { StoreConversationDataTable } from "@/components/tables/store-conversations/data-table"
import {
  StoreConversationEmptyState,
  StoreConversationErrorState,
} from "@/components/tables/store-conversations/empty-states"
import { StoreConversationTableSkeleton } from "@/components/tables/store-conversations/skeleton"
import { StoreConversationTableHeader } from "@/components/tables/store-conversations/table-header"
import {
  getStoreConversationQueueInput,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function ConversationWorkspace({
  activeStoreId,
  stores,
  timeZone,
}: {
  activeStoreId: string
  stores: Array<{ id: string; name: string }>
  timeZone: string
}) {
  const trpc = useTRPC()
  const params = useStoreConversationParams()
  const input = getStoreConversationQueueInput(params, activeStoreId)
  const queue = useQuery(
    trpc.serviceCommerce.storeConversationQueue.queryOptions(input, {
      retry: false,
      refetchInterval: 5_000,
      refetchIntervalInBackground: false,
    }),
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Store operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Conversations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Claim customer requests, respond, and hand work to another active
            attendant. Customer content stays out of this queue.
          </p>
        </div>
      </header>

      <StoreConversationTableHeader
        input={input}
        params={params}
        stores={stores}
      />
      {queue.isLoading ? <StoreConversationTableSkeleton /> : null}
      {queue.isError ? (
        <StoreConversationErrorState retry={() => void queue.refetch()} />
      ) : null}
      {queue.data?.items.length === 0 ? <StoreConversationEmptyState /> : null}
      {queue.data?.items.length ? (
        <StoreConversationDataTable
          items={queue.data.items}
          onOpen={(conversationId) => void params.setSelection(conversationId)}
          timeZone={timeZone}
        />
      ) : null}
      {queue.data?.nextCursor ? (
        <div className="flex justify-end">
          <Button
            onClick={() =>
              void params.setFilters({ cursor: queue.data?.nextCursor })
            }
            variant="outline"
          >
            Next page
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export { StoreConversationTableSkeleton as ConversationQueueSkeleton }
