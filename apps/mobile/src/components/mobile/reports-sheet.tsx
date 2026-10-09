import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColors } from "@/hooks/use-color"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { RefreshControl, ScrollView } from "react-native"
import { HeroCard } from "./green-till/hero-card"
import {
  type AttentionItem,
  AttentionRail,
  ListCard,
  RecordRow,
  SectionHeader,
} from "./green-till/kit"
import { REPORTS_COPY, buildReportsPresentation } from "./reports-presentation"

const OPERATION_ICONS = {
  inventory: "Warehouse",
  pending: "Clock",
  service: "Wrench",
} as const satisfies Record<string, IconKeys>

export function ReportsContent(props: {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const { profile } = useAuthContext()
  if (
    profile?.staffAccessMode === "SCOPED" &&
    profile.role?.toUpperCase() === "MANAGER"
  )
    return (
      <StatusBanner
        title="Reports access required"
        message="Your Store role includes Payments received. Ask the owner about report access."
        tone="warning"
      />
    )
  return <OperationalReportsContent {...props} />
}
function OperationalReportsContent({
  onComplete,
  presentation = "sheet",
}: {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const colors = useColors()
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true },
      { retry: false, enabled: !offline },
    ),
  )
  const reconciliation = useQuery(
    trpc.inventory.reconciliationReport.queryOptions(
      {},
      { retry: false, enabled: !offline },
    ),
  )
  const services = useQuery(
    trpc.serviceReporting.summary.queryOptions(
      {},
      { retry: false, enabled: !offline },
    ),
  )
  const orders = useQuery(
    trpc.orders.reportSummary.queryOptions(undefined, {
      retry: false,
      enabled: !offline,
    }),
  )
  const reportQueries = [balances, reconciliation, services, orders] as const
  const failedQueries = reportQueries.filter((query) => query.isError)
  const isInitialLoading = reportQueries.some(
    (query) => query.isPending && query.data === undefined,
  )
  const isRefreshing = reportQueries.some((query) => query.isRefetching)
  const orderCount = orders.data?.orderCount ?? 0
  const orderValueMinor = orders.data?.orderValueMinor ?? 0
  const currency = orders.data?.currencyCode ?? "NGN"
  const report = buildReportsPresentation({
    balanceSources: balances.data?.rows.length ?? 0,
    orderCount,
    orderValueMinor,
    provisionalCommands: reconciliation.data?.provisionalCommands ?? 0,
    service: {
      blocked: services.data?.work.blocked ?? 0,
      overdueJobs: services.data?.work.overdueJobs ?? 0,
      ready: services.data?.work.ready ?? 0,
      wip: services.data?.work.wip ?? 0,
    },
  })

  async function refreshReports() {
    if (offline) return
    await Promise.all(reportQueries.map((query) => query.refetch()))
  }

  async function retryFailedReports() {
    if (offline) return
    await Promise.all(failedQueries.map((query) => query.refetch()))
  }

  const attention: AttentionItem[] = []
  if (reconciliation.data?.provisionalCommands)
    attention.push({
      key: "sync",
      icon: "RefreshCw",
      tint: "amber",
      title: `${reconciliation.data.provisionalCommands} pending records`,
      sub: "Review sync activity",
      onPress: () => router.push("/sync-status-modal"),
    })
  if (services.data?.work.overdueJobs)
    attention.push({
      key: "service",
      icon: "Wrench",
      tint: "rose",
      title: `${services.data.work.overdueJobs} overdue jobs`,
      sub: "Open service work",
      onPress: () => router.push("/service-jobs-modal" as Href),
    })
  const operationSources = {
    inventory: balances,
    pending: reconciliation,
    service: services,
  }
  const operationRoutes = {
    inventory: "/stock-intake-modal",
    pending: "/sync-status-modal",
    service: "/service-jobs-modal",
  } as const
  const oldestUpdate = Math.min(
    ...reportQueries.filter((q) => q.data).map((q) => q.dataUpdatedAt),
  )
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        gap: 16,
        paddingHorizontal: 18,
        paddingBottom: 48,
      }}
      refreshControl={
        offline ? undefined : (
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refreshReports()}
            refreshing={isRefreshing}
            tintColor={colors.primary}
          />
        )
      }
    >
      {offline ? (
        <StatusBanner
          tone="warning"
          title="Offline reports"
          message={
            Number.isFinite(oldestUpdate)
              ? `Saved figures · as of ${new Date(oldestUpdate).toLocaleString()}`
              : "Reconnect to load reports."
          }
        />
      ) : null}
      {failedQueries.length ? (
        <StatusBanner
          actionLabel={offline ? undefined : "Try again"}
          title="Reports incomplete"
          message="Available values remain visible. Unavailable sources show —."
          tone="destructive"
          onActionPress={() => void retryFailedReports()}
        />
      ) : null}
      {orders.isPending && !offline ? (
        <Skeleton className="h-48 rounded-[22px]" />
      ) : (
        <HeroCard
          label="Order value · all time"
          amount={
            orders.data ? formatMinorMoney(orderValueMinor, currency) : "—"
          }
          pill={{ label: "Store snapshot", tone: "synced" }}
          sub={
            orders.data
              ? `${orderCount} order${orderCount === 1 ? "" : "s"} · average ${formatMinorMoney(
                  orderCount ? Math.round(orderValueMinor / orderCount) : 0,
                  currency,
                )}`
              : "Order summary unavailable"
          }
        />
      )}
      {attention.length ? (
        <View>
          <SectionHeader
            title="Needs attention"
            trailing={
              <Text className="text-xs font-bold text-muted-foreground">
                {attention.length}
              </Text>
            }
          />
          <AttentionRail items={attention} />
        </View>
      ) : null}
      <View>
        <SectionHeader title="Operations" />
        <ListCard>
          {report.operations.map((item) => (
            <RecordRow
              stackDetails
              key={item.id}
              title={item.label}
              meta={
                operationSources[item.id].data
                  ? item.detail
                  : operationSources[item.id].isFetching
                    ? "Loading…"
                    : "Source unavailable"
              }
              amount={operationSources[item.id].data ? item.value : "—"}
              avatar={{
                icon: OPERATION_ICONS[item.id],
                tint:
                  item.id === "pending"
                    ? "amber"
                    : item.id === "service"
                      ? "lilac"
                      : "mint",
              }}
              onPress={() => router.push(operationRoutes[item.id] as Href)}
            />
          ))}
        </ListCard>
      </View>
      {report.isEmpty && reportQueries.every((q) => q.data !== undefined) ? (
        <EmptyState
          icon="analytics"
          title={REPORTS_COPY.emptyTitle}
          message={REPORTS_COPY.emptyMessage}
        />
      ) : null}
      <View className="flex-row gap-2 px-0.5">
        <Icon
          className="mt-0.5 size-[14px]"
          color={colors.mutedForeground}
          name="Info"
        />
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
          {REPORTS_COPY.boundaryMessage}
        </Text>
      </View>
      {presentation === "sheet" && onComplete ? (
        <ActionButton variant="outline" onPress={onComplete}>
          Done
        </ActionButton>
      ) : null}
    </ScrollView>
  )
}
