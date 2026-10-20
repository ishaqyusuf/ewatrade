"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { ScrollableContent } from "@/components/scrollable-content"
import { StoreConversationDataTable } from "@/components/tables/store-conversations/data-table"
import {
  StoreConversationAccessState,
  StoreConversationEmptyState,
  StoreConversationErrorState,
} from "@/components/tables/store-conversations/empty-states"
import { StoreConversationTableSkeleton } from "@/components/tables/store-conversations/skeleton"
import { StoreConversationTableHeader } from "@/components/tables/store-conversations/table-header"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import {
  getStoreConversationQueueInput,
  hasStoreConversationFilters,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryViewSettings } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function ConversationWorkspace({
  activeStoreId,
  stores,
  timeZone,
  initialSettings,
  initialViewSettings,
}: {
  activeStoreId: string
  stores: Array<{ id: string; name: string }>
  timeZone: string
  initialSettings?: Partial<TableSettings>
  initialViewSettings: DirectoryViewSettings
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({
      pageId: "store-conversations",
      queryKey: "conversationView",
      initialSettings: initialViewSettings,
    })
  const trpc = useTRPC()
  const params = useStoreConversationParams()
  const selectedStore =
    params.store && stores.some((store) => store.id === params.store)
      ? params.store
      : activeStoreId
  const input = getStoreConversationQueueInput(
    { ...params, store: selectedStore },
    activeStoreId,
  )
  const filtered = hasStoreConversationFilters(
    { ...params, store: selectedStore },
    activeStoreId,
  )
  const queue = useQuery(
    trpc.serviceCommerce.storeConversationQueue.queryOptions(input, {
      retry: false,
      refetchInterval: 5_000,
      refetchIntervalInBackground: false,
    }),
  )
  const toggleSort = (field: "last_customer_activity" | "response_due_at") => {
    const direction =
      input.sort[0] === field && input.sort[1] === "asc" ? "desc" : "asc"
    void params.setFilters({ sort: field, direction })
  }

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-1 flex-col gap-5 pt-6">
        <PageHeader
          eyebrow="Store operations"
          title="Conversations"
          description="Claim customer requests, respond, and hand work to another active attendant. Customer content stays out of this queue."
        >
          <PageToolbar
            actions={
              <ViewSwitcher
                label="Conversation view"
                value={view}
                options={directoryViewOptions}
                onValueChange={setView}
              />
            }
          >
            <StoreConversationTableHeader
              input={input}
              params={params}
              stores={stores}
            />
          </PageToolbar>
        </PageHeader>
        {persistenceError ? (
          <Alert appearance="dashboard" role="alert">
            <AlertDescription>{persistenceError}</AlertDescription>
            <Button variant="outline" size="sm" onClick={retryPersistence}>
              Retry saving view
            </Button>
          </Alert>
        ) : null}
        {queue.isLoading ? (
          <StoreConversationTableSkeleton
            initialSettings={initialSettings}
            view={view}
          />
        ) : null}
        {queue.isError && queue.error.data?.code === "FORBIDDEN" ? (
          <StoreConversationAccessState />
        ) : null}
        {queue.isError && queue.error.data?.code !== "FORBIDDEN" ? (
          <StoreConversationErrorState retry={() => void queue.refetch()} />
        ) : null}
        {!queue.isError && queue.data?.items.length === 0 ? (
          <StoreConversationEmptyState
            filtered={filtered}
            onClearFilters={() =>
              void params.setFilters({
                assignment: "all",
                q: null,
                requestKinds: null,
                sla: "all",
                store: null,
              })
            }
          />
        ) : null}
        {!queue.isError && queue.data?.items.length ? (
          <StoreConversationDataTable
            items={queue.data.items}
            view={view}
            selectionScope={JSON.stringify({
              ...input,
              cursor: undefined,
              sort: undefined,
            })}
            onOpen={(conversationId) =>
              void params.setSelection(conversationId)
            }
            timeZone={timeZone}
            sort={input.sort}
            toggleSort={toggleSort}
            retry={() => void queue.refetch()}
            initialSettings={initialSettings}
          />
        ) : null}
        {queue.data?.nextCursor ? (
          <div className="flex justify-end">
            <Button
              onClick={() =>
                void params.setFilters({ cursor: queue.data?.nextCursor })
              }
              variant="outline"
              appearance="form"
            >
              Next page
            </Button>
          </div>
        ) : null}
      </div>
    </ScrollableContent>
  )
}

export { StoreConversationTableSkeleton as ConversationQueueSkeleton }
