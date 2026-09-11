import { useServiceAppearance } from "./use-service-appearance"
import { ServiceAction as ActionButton } from "./service-action"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import type { ReactNode } from "react"
import { FlatList } from "react-native-css/components/FlatList"
import type { ServiceJobsModel } from "./use-service-jobs"

export function ServiceJobsQueue({
  model,
  feedback,
}: { model: ServiceJobsModel; feedback: ReactNode }) {
  const {
    market,
    ServiceHeader: Header,
    ServiceJobRow: Row,
  } = useServiceAppearance()
  const {
    setCreating,
    setAmountPaid,
    setPaymentReference,
    setSelectedJobId,
    jobsQuery,
    jobs,
    isOfflineMode,
    search,
  } = model
  return (
    <FlatList
      className="flex-1"
      contentContainerClassName="px-5 pb-[var(--service-jobs-bottom)]"
      data={jobs}
      keyExtractor={(job) => job.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      refreshControl={!isOfflineMode ? <QueryRefreshControl /> : undefined}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (
          !isOfflineMode &&
          !jobsQuery.isError &&
          shouldFetchNextListPage({
            hasNextPage: Boolean(jobsQuery.hasNextPage),
            isFetchingNextPage: jobsQuery.isFetchingNextPage,
          })
        )
          void jobsQuery.fetchNextPage()
      }}
      ListHeaderComponent={
        <View className="gap-5 pb-5">
          {feedback}
          <Header
            mode="queue"
            title="Good work. Ready on time."
            description="Charge-only services stay in Orders. Tracked offerings appear here after confirmation."
            meta={market ? `${jobs.length} loaded jobs` : undefined}
          />
          <ActionButton
            icon="Plus"
            tone="gold"
            disabled={isOfflineMode}
            onPress={() => {
              setAmountPaid("")
              setPaymentReference("")
              setCreating(true)
            }}
          >
            New service
          </ActionButton>
          {jobsQuery.isError && !isOfflineMode ? (
            <View className="gap-3">
              <StatusBanner
                title="Could not load service work"
                icon="AlertCircle"
                tone="destructive"
                message={jobsQuery.error.message}
              />
              <ActionButton
                variant="outline"
                isLoading={jobsQuery.isFetching}
                onPress={() => void jobsQuery.refetch()}
              >
                Retry work queue
              </ActionButton>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        jobsQuery.isLoading && !isOfflineMode ? (
          <StatusBanner
            icon="Loader2"
            message="Loading current service work."
            title="Work queue"
          />
        ) : jobsQuery.isError && !isOfflineMode ? null : (
          <EmptyState
            icon="ClipboardList"
            title={
              search.trim()
                ? "No matching work"
                : isOfflineMode
                  ? "No cached work"
                  : "No active work"
            }
            message={
              search.trim()
                ? "Try another receipt or service, or clear the search below."
                : isOfflineMode
                  ? "Reconnect to load current service jobs."
                  : "Create a tracked service order to start work."
            }
          />
        )
      }
      renderItem={({ item: job }) => (
        <Row
          job={job}
          onPress={() => {
            setAmountPaid("")
            setPaymentReference("")
            setSelectedJobId(job.id)
          }}
        />
      )}
      ListFooterComponent={
        jobsQuery.isFetchingNextPage ? (
          <Text className="py-4 text-center text-xs font-semibold text-muted-foreground">
            Loading more service jobs…
          </Text>
        ) : null
      }
    />
  )
}
