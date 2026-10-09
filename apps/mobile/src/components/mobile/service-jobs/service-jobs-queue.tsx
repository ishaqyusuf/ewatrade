import { EmptyState } from "@/components/mobile/empty-state"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { formatMinorMoney } from "@ewatrade/utils"
import { useState } from "react"
import type { ReactNode } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
} from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { HeroCard } from "../green-till/hero-card"
import { ServiceAction as ActionButton } from "./service-action"
import { overdueWork, workMatches } from "./service-work-summary"
import { useServiceAppearance } from "./use-service-appearance"
import type { ServiceJobsModel } from "./use-service-jobs"

const WORK_FILTER_LABELS: Record<string, string> = {
  all: "All",
  blocked: "Blocked",
  in_progress: "In progress",
  mine: "Mine",
  overdue: "Overdue",
  queued: "Queued",
  ready: "Ready",
}

export function ServiceJobsQueue({
  model,
  feedback,
  onScroll,
}: {
  model: ServiceJobsModel
  feedback: ReactNode
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
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
  const activeJobs = jobs.filter(
    (job) =>
      !job.handedOffAt && !["completed", "cancelled"].includes(job.summary),
  )
  const active = activeJobs.length
  const countOf = (value: string) =>
    jobs.filter((job) => workMatches(job, value, model.profile?.id, now)).length
  const working = countOf("in_progress")
  const queued = countOf("queued")
  const blocked = countOf("blocked")
  const mine = countOf("mine")
  const readyJobs = jobs.filter((job) =>
    workMatches(job, "ready", undefined, now),
  )
  const dueCurrencies = new Set(readyJobs.map((job) => job.currencyCode))
  const readyDueMinor =
    dueCurrencies.size === 1
      ? readyJobs.reduce((sum, job) => sum + job.balanceDueMinor, 0)
      : 0
  const salesRep = isSalesRepRole(model.profile?.role)
  const filters = [
    ...(salesRep || mine ? (["mine"] as const) : []),
    "all",
    "ready",
    "in_progress",
    "queued",
    ...(blocked ? (["blocked"] as const) : []),
    ...(late ? (["overdue"] as const) : []),
  ]
  const heroSub =
    isOfflineMode && jobsQuery.dataUpdatedAt
      ? `Saved copy · as of ${new Date(jobsQuery.dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
      : ready
        ? `${ready} ready to collect${readyDueMinor > 0 ? ` · ${formatMinorMoney(readyDueMinor, [...dueCurrencies][0])} due` : ""}`
        : late
          ? `${late} overdue`
          : active
            ? "Nothing ready to collect yet"
            : "No work waiting"
  const reveal = useFirstReveal(!jobsQuery.isPending)
  return (
    <FlatList
      className="flex-1"
      contentContainerClassName={
        market
          ? "gap-2 px-[18px] pb-[var(--service-jobs-bottom)]"
          : "px-[18px] pb-[var(--service-jobs-bottom)]"
      }
      data={visible}
      keyExtractor={(job) => job.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      refreshControl={!isOfflineMode ? <QueryRefreshControl /> : undefined}
      onEndReachedThreshold={0.4}
      onScroll={onScroll}
      scrollEventThrottle={16}
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
                    : `${active} active job${active === 1 ? "" : "s"}`
              }
              sub={jobsQuery.isPending ? undefined : heroSub}
              pill={{
                label: isOfflineMode ? "Offline" : "Synced",
                tone: isOfflineMode ? "offline" : "synced",
              }}
              stats={
                jobsQuery.isPending || (jobsQuery.isError && !jobs.length)
                  ? undefined
                  : [
                      { label: "Ready", value: String(ready) },
                      { label: "In progress", value: String(working) },
                      { label: "Queued", value: String(queued) },
                    ]
              }
            >
              {jobsQuery.isPending ? (
                <View className="mt-4">
                  <Skeleton height={40} />
                </View>
              ) : null}
            </HeroCard>
          )}
          {!market && jobs.length ? (
            <ScrollView
              contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginHorizontal: -18 }}
            >
              {filters.map((value) => (
                <ClassicCustomerBookFilter
                  key={value}
                  active={filter === value}
                  count={value === "all" ? jobs.length : countOf(value)}
                  label={WORK_FILTER_LABELS[value]}
                  onPress={() => setFilter(value)}
                />
              ))}
            </ScrollView>
          ) : null}
          {market ? (
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
          ) : null}
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
          {!market && visible.length ? (
            <View className="-mb-3 flex-row items-baseline justify-between px-0.5">
              <Text
                accessibilityRole="header"
                className="text-base font-extrabold tracking-tight text-foreground"
              >
                Work queue
              </Text>
              <Text className="text-xs font-bold text-muted-foreground">
                {visible.length} shown
              </Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        !market && jobsQuery.isLoading && !isOfflineMode ? (
          <SkeletonGroup accessibilityLabel="Loading service work">
            <View className="gap-3">
              <Skeleton height={64} />
              <Skeleton height={64} />
            </View>
          </SkeletonGroup>
        ) : jobsQuery.isLoading && !isOfflineMode ? (
          <ListSkeleton count={4} label="Loading service work" />
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
            first={index === 0}
            last={index === visible.length - 1}
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
