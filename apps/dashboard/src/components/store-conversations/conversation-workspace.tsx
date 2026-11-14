"use client"

import { ScrollableContent } from "@/components/scrollable-content"
import {
  StoreConversationAccessState,
  StoreConversationEmptyState,
  StoreConversationErrorState,
} from "@/components/tables/store-conversations/empty-states"
import {
  getStoreConversationQueueInput,
  hasStoreConversationFilters,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { INBOX_CHECK_MS, boundedCheckInterval } from "@/lib/bounded-refresh"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import {
  ConversationInboxList,
  ConversationInboxSkeleton,
  InboxFilterPills,
  inboxFilterOf,
  inboxFilterParams,
} from "./conversation-inbox"

/**
 * Customer conversations for the active store, newest message first. The top
 * bar store picker chooses the store; rows open the chat sheet.
 */
export function ConversationWorkspace({
  activeStoreId,
  timeZone,
}: {
  activeStoreId: string
  timeZone: string
}) {
  const trpc = useTRPC()
  const params = useStoreConversationParams()
  const scoped = { ...params, store: activeStoreId }
  const input = getStoreConversationQueueInput(scoped, activeStoreId)
  const filtered = hasStoreConversationFilters(scoped, activeStoreId)
  const queue = useQuery(
    trpc.serviceCommerce.storeConversationQueue.queryOptions(input, {
      retry: false,
      // Focus, after actions, and one check a minute while visible and in use
      // (see lib/bounded-refresh). Was every 5s with no end.
      refetchInterval: (query) =>
        boundedCheckInterval(query.state.error, INBOX_CHECK_MS),
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
    }),
  )
  const filter = inboxFilterOf(params)
  const forbidden = queue.isError && queue.error.data?.code === "FORBIDDEN"

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pb-10">
        {forbidden ? null : (
          <InboxFilterPills
            value={filter}
            onChange={(next) => void params.setFilters(inboxFilterParams(next))}
          />
        )}
        {queue.isLoading ? <ConversationInboxSkeleton /> : null}
        {forbidden ? <StoreConversationAccessState /> : null}
        {queue.isError && !forbidden ? (
          <StoreConversationErrorState retry={() => void queue.refetch()} />
        ) : null}
        {!queue.isError && queue.data?.items.length === 0 ? (
          <StoreConversationEmptyState
            filtered={filtered || Boolean(params.cursor)}
            onClearFilters={() =>
              void params.setFilters({
                ...inboxFilterParams("all"),
                cursor: null,
              })
            }
          />
        ) : null}
        {!queue.isError && queue.data?.items.length ? (
          <ConversationInboxList
            items={queue.data.items}
            onOpen={(conversationId) =>
              void params.setSelection(conversationId)
            }
            timeZone={timeZone}
          />
        ) : null}
        {params.cursor || queue.data?.nextCursor ? (
          <div className="flex flex-wrap justify-end gap-2">
            {params.cursor ? (
              <Button
                variant="outline"
                onClick={() => void params.setFilters({ cursor: null })}
              >
                Newest
              </Button>
            ) : null}
            {queue.data?.nextCursor ? (
              <Button
                variant="outline"
                onClick={() =>
                  void params.setFilters({ cursor: queue.data?.nextCursor })
                }
              >
                Older
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ScrollableContent>
  )
}

export { ConversationInboxSkeleton as ConversationQueueSkeleton }
