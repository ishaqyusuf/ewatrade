import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { useState } from "react"
import type { ReactNode } from "react"
import { FlatList } from "react-native-css/components/FlatList"
import { CommerceFilterChip } from "../commerce"
import { FormField } from "../form-field"
import { HeroCard } from "../green-till/hero-card"
import { ServiceAction as ActionButton } from "./service-action"
import { overdueWork, workMatches } from "./service-work-summary"
import { useServiceAppearance } from "./use-service-appearance"
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
  const [filter, setFilter] = useState(
    isSalesRepRole(model.profile?.role) ? "mine" : "all",
  )
  const now = Date.now()
  const visible = market
    ? jobs
    : jobs.filter((job) => workMatches(job, filter, model.profile?.id, now))
  const ready = jobs.filter((job) =>
    workMatches(job, "ready", undefined, now),
  ).length
  const late = jobs.filter((job) => overdueWork(job, now)).length
  const active = jobs.filter(
    (job) =>
      !job.handedOffAt && !["completed", "cancelled"].includes(job.summary),
  ).length
  const reveal = useFirstReveal(!jobsQuery.isPending)
  return (
    <FlatList
      className="flex-1"
      contentContainerClassName="gap-2 px-[18px] pb-[var(--service-jobs-bottom)]"
      data={visible}
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
          {market ? (
            <Header
              mode="queue"
              title="Good work. Ready on time."
              description="Charge-only services stay in Orders. Tracked offerings appear here after confirmation."
              meta={`${jobs.length} loaded jobs`}
            />
          ) : (
            <HeroCard
              label="Service work"
              title={
                jobsQuery.isPending
                  ? "Your work queue"
                  : jobsQuery.isError && !jobs.length
                    ? "Work unavailable"
                    : `${active} active jobs`
              }
              sub={`Loaded ${jobs.length} jobs${isOfflineMode && jobsQuery.dataUpdatedAt ? ` · as of ${new Date(jobsQuery.dataUpdatedAt).toLocaleString()}` : " · counts cover this loaded view"}`}
              pill={{
                label: isOfflineMode ? "Saved copy" : "Online",
                tone: isOfflineMode ? "offline" : "synced",
              }}
              stats={
                jobsQuery.isPending || (jobsQuery.isError && !jobs.length)
                  ? undefined
                  : [
                      { label: "Active", value: String(active) },
                      { label: "Ready", value: String(ready) },
                      { label: "Overdue", value: String(late) },
                    ]
              }
            >
              {jobsQuery.isPending ? (
                <View className="mt-4">
                  <Skeleton className="h-10 w-full" />
                </View>
              ) : null}
            </HeroCard>
          )}
          {!market ? (
            <>
              <FormField
                label="Find a job"
                accessibilityLabel="Search service jobs"
                value={search}
                onChangeText={model.setSearch}
                placeholder="Receipt or service"
              />
              <View className="flex-row flex-wrap gap-2">
                {[
                  "all",
                  "mine",
                  "ready",
                  "blocked",
                  ...(late ? ["overdue"] : []),
                ].map((value) => (
                  <CommerceFilterChip
                    key={value}
                    label={
                      value === "all"
                        ? "All loaded"
                        : value[0].toUpperCase() + value.slice(1)
                    }
                    active={filter === value}
                    onPress={() => setFilter(value)}
                  />
                ))}
              </View>
            </>
          ) : null}
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
        !market && jobsQuery.isLoading && !isOfflineMode ? (
          <View className="gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </View>
        ) : jobsQuery.isLoading && !isOfflineMode ? (
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
      renderItem={({ item: job, index }) => (
        <RevealItem active={reveal} index={index}>
          <Row
            job={job}
            onPress={() => {
              setAmountPaid("")
              setPaymentReference("")
              setSelectedJobId(job.id)
            }}
          />
        </RevealItem>
      )}
      ListFooterComponent={
        !market && jobsQuery.hasNextPage && !isOfflineMode ? (
          <ActionButton
            variant="outline"
            isLoading={jobsQuery.isFetchingNextPage}
            onPress={() => void jobsQuery.fetchNextPage()}
          >
            Load more jobs
          </ActionButton>
        ) : jobsQuery.isFetchingNextPage ? (
          <Text className="py-4 text-center text-xs font-semibold text-muted-foreground">
            Loading more service jobs…
          </Text>
        ) : null
      }
    />
  )
}
